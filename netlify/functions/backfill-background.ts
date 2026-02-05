import type { Context } from "@netlify/functions";
import { requireSymbol } from "./lib/validate";
import { fetchSymbolStreamPage, extractWatchersFromMessages } from "./lib/stocktwits";
import { getJSON, setJSON, kState, kMsgs } from "./lib/blobs";
import type { MessageLite } from "../../shared/types";
import { TICKER_MAP } from "../../shared/tickers";
import { toUTCDateISO } from "./lib/time";
import { modelSentiment } from "./lib/sentiment";
import { normalizedHash, updateDuplicateState, spamScore, countCashtags, countTokens } from "./lib/spam";
import { updateSeries } from "./lib/aggregate";

function toLite(symbol: string, m: any, duplicateSymbolsCount: number, whitelistDisplayName?: string): MessageLite {
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
      displayName: whitelistDisplayName || undefined,
      followers,
      joinDate,
      official: Boolean(user?.official)
    },
    stSentimentBasic:
      m?.entities?.sentiment?.basic === "Bullish" || m?.entities?.sentiment?.basic === "Bearish"
        ? m.entities.sentiment.basic
        : null,
    modelSentiment: ms,
    likes: Number(m?.likes?.total ?? 0),
    replies: Number(m?.conversation?.replies ?? 0),
    symbolsTagged,
    links,
    spam: {
      score: spam.score,
      reasons: spam.reasons,
      normalizedHash: body ? normalizedHash(body) : undefined
    }
  };
}

export default async (req: Request, _context: Context) => {
  try {
    if (req.method !== "POST") return new Response(null, { status: 405 });

    // If ADMIN_TOKEN is set in Netlify env, require it for backfills (prevents random visitors from triggering it).
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken) {
      const provided = req.headers.get("x-admin-token") || "";
      if (provided !== adminToken) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const symbol = requireSymbol(body?.symbol);
    const days = Math.max(1, Math.min(90, Number(body?.days ?? 30)));

    const cfg = TICKER_MAP[symbol];
    const wlName = new Map(
      (cfg.whitelistUsers ?? [])
        .filter((u) => u.username && u.name)
        .map((u) => [u.username.toLowerCase(), u.name as string])
    );

    const cutoffMs = Date.now() - days * 24 * 3600 * 1000;

    let pageMax: number | undefined = undefined;
    let pages = 0;

    const stored: MessageLite[] = [];
    while (pages < 500) {
      const resp = await fetchSymbolStreamPage(symbol, pageMax);
      const msgs = resp.messages ?? [];
      if (msgs.length === 0) break;

      const oldest = msgs[msgs.length - 1];
      const oldestId = Number(oldest?.id ?? 0);

      for (const m of msgs) {
        const createdAt = String(m?.created_at ?? "");
        if (!createdAt) continue;
        if (new Date(createdAt).getTime() < cutoffMs) {
          pageMax = undefined;
          pages = 999999;
          break;
        }

        const bodyText = String(m?.body ?? "").trim();
        let dupCount = 1;
        if (bodyText) {
          dupCount = await updateDuplicateState(normalizedHash(bodyText), symbol, createdAt);
        }

        const username = String(m?.user?.username ?? "unknown");
        const displayName = wlName.get(username.toLowerCase()) || undefined;

        stored.push(toLite(symbol, m, dupCount, displayName));
      }

      // next page older
      pageMax = oldestId > 0 ? oldestId - 1 : undefined;
      pages += 1;

      if (!resp.cursor?.more) break;
    }

    // Dedupe by id within this run
    const byId = new Map<number, MessageLite>();
    for (const m of stored) byId.set(m.id, m);

    const all = [...byId.values()].sort((a, b) => a.id - b.id);

    // Load state + merge into per-day blobs
    const state = (await getJSON<any>(kState(symbol))) ?? {};
    const todayISO = toUTCDateISO(new Date());

    // group by day
    const byDay = new Map<string, MessageLite[]>();
    for (const m of all) {
      const d = toUTCDateISO(new Date(m.createdAt));
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(m);
    }

    // write day blobs + aggregate
    for (const [d, msgs] of byDay.entries()) {
      const existing = ((await getJSON<MessageLite[]>(kMsgs(symbol, d))) ?? []) as MessageLite[];
      const existingById = new Map<number, MessageLite>();
      for (const em of existing) existingById.set(em.id, em);
      for (const nm of msgs) existingById.set(nm.id, nm);

      const merged = [...existingById.values()].sort((a, b) => a.id - b.id);
      await setJSON(kMsgs(symbol, d), merged);

      await updateSeries(symbol, d, merged);
    }

    // update state watchers snapshot (best effort)
    const watchers = extractWatchersFromMessages(all as any);
    state.lastWatchers = watchers ?? state.lastWatchers ?? null;

    // do NOT change lastSeenId on backfill (sync owns that), but update sync time
    state.lastSyncAt = new Date().toISOString();
    state.lastBackfillAt = new Date().toISOString();
    state.lastBackfillDays = days;

    await setJSON(kState(symbol), state);

    return new Response(
      JSON.stringify({
        ok: true,
        symbol,
        days,
        pages,
        stored: all.length,
        wroteDays: [...byDay.keys()].length,
        lastDay: todayISO
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};
