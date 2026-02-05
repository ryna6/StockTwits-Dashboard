import type { MessageLite } from "../../../shared/types";
import { TICKER_MAP } from "../../../shared/tickers";
import { fetchSymbolStreamPage, extractWatchersFromMessages } from "./stocktwits";
import { getJSON, setJSON, delKey, kState, kMsgs, kLock } from "./blobs";
import { envInt, envFloat } from "./validate";
import { toUTCDateISO, nowISO } from "./time";
import { modelSentiment } from "./sentiment";
import { normalizedHash, updateDuplicateState, spamScore, countCashtags, countTokens } from "./spam";
import { updateSeries } from "./aggregate";

type SymbolState = {
  symbol: string;
  lastSeenId: number | null;
  lastSyncAt: string | null;
  lastWatchers: number | null;
};

const LOCK_STALE_MS = 10 * 60 * 1000;

async function acquireLock(symbol: string) {
  const key = kLock(symbol);
  const existing = await getJSON<any>(key);
  if (existing?.at && typeof existing.at === "string") {
    const age = Date.now() - new Date(existing.at).getTime();
    if (age < LOCK_STALE_MS) {
      throw new Error(`Sync already running for ${symbol}`);
    }
    // stale lock
    await delKey(key).catch(() => {});
  }
  await setJSON(key, { symbol, at: nowISO() }, { onlyIfNew: true } as any);
}

async function releaseLock(symbol: string) {
  await delKey(kLock(symbol)).catch(() => {});
}

function toLite(symbol: string, m: any, duplicateSymbolsCount: number): MessageLite {
  const body = String(m?.body ?? "").trim();
  const createdAt = String(m?.created_at ?? "");
  const user = m?.user ?? {};

  const hasMedia = Array.isArray(m?.entities?.media) && m.entities.media.length > 0;

  const followers = Number(user?.followers ?? 0);
  const joinDate = user?.join_date ? String(user.join_date) : undefined;
  const accountAgeDays =
    joinDate ? Math.floor((Date.now() - new Date(joinDate).getTime()) / (24 * 3600 * 1000)) : null;

  const symbolsTagged = (m?.symbols ?? []).map((s: any) => String(s?.symbol ?? "").toUpperCase()).filter(Boolean);

  const cashtags = countCashtags(body);
  const tokens = countTokens(body);

  const nh = body ? normalizedHash(body) : undefined;
  const spam = body
    ? spamScore({
        body,
        symbolsTaggedCount: symbolsTagged.length,
        cashtagCount: cashtags,
        tokenCount: tokens,
        followers,
        accountAgeDays,
        duplicateSymbolsCount
      })
    : { score: 0, reasons: [] as string[] };

  const ms = hasMedia && !body ? { score: 0, label: "neutral" as const } : modelSentiment(body);

  const likes = Number(m?.likes?.total ?? 0);
  const replies = Number(m?.conversation?.replies ?? 0);

  const stBasic = m?.entities?.sentiment?.basic;
  const stSentimentBasic =
    stBasic === "Bullish" || stBasic === "Bearish" ? (stBasic as "Bullish" | "Bearish") : null;

  const linksRaw = Array.isArray(m?.links) ? m.links : [];
  const links = linksRaw
    .map((l: any) => ({
      url: String(l?.url ?? l?.shortened_url ?? "").trim(),
      title: l?.title ? String(l.title) : undefined,
      source: l?.source?.name ? String(l.source.name) : undefined
    }))
    .filter((l: any) => l.url);

  return {
    id: Number(m?.id),
    createdAt,
    body,
    hasMedia,
    user: {
      id: Number(user?.id ?? 0),
      username: String(user?.username ?? "unknown"),
      followers,
      joinDate,
      official: Boolean(user?.official)
    },
    stSentimentBasic,
    modelSentiment: ms,
    likes,
    replies,
    symbolsTagged,
    links,
    spam: {
      score: spam.score,
      reasons: spam.reasons,
      normalizedHash: nh
    }
  };
}

async function loadDay(symbol: string, date: string): Promise<MessageLite[]> {
  return (await getJSON<MessageLite[]>(kMsgs(symbol, date))) ?? [];
}

async function saveDay(symbol: string, date: string, msgs: MessageLite[]) {
  // keep days bounded (don’t let a day blob explode)
  const trimmed = msgs
    .sort((a, b) => b.id - a.id)
    .slice(0, 2500);
  await setJSON(kMsgs(symbol, date), trimmed);
}

export async function syncSymbol(symbol: string) {
  const cfg = TICKER_MAP[symbol];
  if (!cfg) throw new Error(`Unknown symbol: ${symbol}`);

  const maxPages = envInt("SYNC_MAX_PAGES", 10);
  const spamThreshold = envFloat("SPAM_THRESHOLD", 0.75);

  await acquireLock(symbol);
  try {
    const stateKey = kState(symbol);
    const state = (await getJSON<SymbolState>(stateKey)) ?? {
      symbol,
      lastSeenId: null,
      lastSyncAt: null,
      lastWatchers: null
    };

    let pageMax: number | undefined = undefined;
    let pages = 0;

    const collectedRaw: any[] = [];
    let foundLastSeen = state.lastSeenId === null;

    while (pages < maxPages) {
      const resp = await fetchSymbolStreamPage(symbol, pageMax);
      const msgs = resp.messages ?? [];
      if (msgs.length === 0) break;

      // newest-first, so oldest is last
      const oldestId = Number(msgs[msgs.length - 1]?.id ?? 0);
      const newestId = Number(msgs[0]?.id ?? 0);

      // If we have lastSeenId, collect only messages > lastSeenId
      if (state.lastSeenId !== null) {
        for (const m of msgs) {
          const id = Number(m?.id ?? 0);
          if (id > state.lastSeenId) collectedRaw.push(m);
          else foundLastSeen = true;
        }
        if (foundLastSeen) break;
      } else {
        // no lastSeenId: treat the latest page as "new"
        for (const m of msgs) collectedRaw.push(m);
        // stop after first page for initial state (backfill handles history)
        break;
      }

      // next page goes older
      if (!oldestId) break;
      pageMax = oldestId - 1;
      pages += 1;

      // small early stop: if the newest page is already older than lastSeenId
      if (state.lastSeenId !== null && newestId <= state.lastSeenId) break;
    }

    // watchers snapshot (latest available in messages)
    const watchers = extractWatchersFromMessages(symbol, collectedRaw) ?? extractWatchersFromMessages(symbol, (await fetchSymbolStreamPage(symbol)).messages);

    // Duplicate-blast detection: update hash state and compute duplicateSymbolsCount
    const liteMessages: MessageLite[] = [];
    for (const m of collectedRaw) {
      const body = String(m?.body ?? "").trim();
      const createdAt = String(m?.created_at ?? "");
      let dupCount = 1;

      if (body && createdAt) {
        const h = normalizedHash(body);
        dupCount = await updateDuplicateState(h, symbol, createdAt);
        const lite = toLite(symbol, m, dupCount);
        // if dup is high, force spam score high
        if (dupCount >= envInt("DUPLICATE_SYMBOL_THRESHOLD", 3)) {
          lite.spam.score = Math.max(lite.spam.score, 0.95);
          if (!lite.spam.reasons.includes("cross_ticker_duplicate")) lite.spam.reasons.push("cross_ticker_duplicate");
        }
        liteMessages.push(lite);
      } else {
        liteMessages.push(toLite(symbol, m, dupCount));
      }
    }

    // Dedupe by checking what's already in day blobs (bounded, cheap for small caps)
    const newMessages: MessageLite[] = [];
    const dayBuckets = new Map<string, MessageLite[]>();
    for (const lm of liteMessages) {
      const day = toUTCDateISO(new Date(lm.createdAt));
      if (!dayBuckets.has(day)) dayBuckets.set(day, []);
      dayBuckets.get(day)!.push(lm);
    }

    for (const [day, bucket] of dayBuckets.entries()) {
      const existing = await loadDay(symbol, day);
      const existingIds = new Set(existing.map((m) => m.id));
      const filtered = bucket.filter((m) => !existingIds.has(m.id));
      if (filtered.length === 0) continue;

      const merged = [...existing, ...filtered];
      await saveDay(symbol, day, merged);
      newMessages.push(...filtered);
    }

    // Update series (daily aggregates) incrementally
    await updateSeries(symbol, newMessages, watchers ?? null);

    // Update state
    const newestStoredId =
      newMessages.length > 0 ? Math.max(...newMessages.map((m) => m.id)) : state.lastSeenId;

    const newState: SymbolState = {
      symbol,
      lastSeenId: newestStoredId ?? state.lastSeenId ?? null,
      lastSyncAt: nowISO(),
      lastWatchers: watchers ?? state.lastWatchers ?? null
    };

    await setJSON(stateKey, newState);

    const cleanNew = newMessages.filter((m) => m.spam.score < spamThreshold).length;

    return {
      symbol,
      fetched: liteMessages.length,
      storedNew: newMessages.length,
      storedNewClean: cleanNew,
      pagesUsed: pages + 1,
      lastSeenId: newState.lastSeenId,
      lastSyncAt: newState.lastSyncAt,
      watchers: newState.lastWatchers
    };
  } finally {
    await releaseLock(symbol);
  }
}
