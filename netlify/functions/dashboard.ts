import type { Context } from "@netlify/functions";
import type { DashboardResponse, MessageLite } from "../../shared/types";
import { TICKER_MAP } from "../../shared/tickers";
import { requireSymbol, envFloat } from "./lib/validate";
import { getJSON, kMsgs, kState } from "./lib/blobs";
import { hoursAgoDate, toUTCDateISO, addDays } from "./lib/time";
import { loadSeries } from "./lib/aggregate";
import { build24hSummary } from "./lib/summarize";
import { fetchSymbolNewsPage } from "./lib/stocktwits";

function safeMsg(x: any): MessageLite | null {
  if (!x) return null;

  const createdAt =
    typeof x.createdAt === "string"
      ? x.createdAt
      : typeof x.created_at === "string"
        ? x.created_at
        : "";
  if (!createdAt) return null;

  const user = x.user ?? {};
  const links = Array.isArray(x.links) ? x.links : [];

  const modelSent = x.modelSentiment ?? {};
  const spam = x.spam ?? {};

  return {
    id: Number(x.id ?? 0),
    createdAt,
    body: String(x.body ?? ""),
    hasMedia: Boolean(x.hasMedia ?? false),
    user: {
      id: Number(user.id ?? 0),
      username: String(user.username ?? "unknown"),
      displayName: typeof user.displayName === "string" ? user.displayName : undefined,
      followers: Number(user.followers ?? 0),
      joinDate: typeof user.joinDate === "string" ? user.joinDate : undefined,
      official: Boolean(user.official ?? false)
    },
    stSentimentBasic: x.stSentimentBasic ?? null,
    modelSentiment: {
      score: Number(modelSent.score ?? 0),
      label:
        modelSent.label === "bull" || modelSent.label === "bear" || modelSent.label === "neutral"
          ? modelSent.label
          : "neutral"
    },
    likes: Number(x.likes ?? 0),
    replies: Number(x.replies ?? 0),
    symbolsTagged: Array.isArray(x.symbolsTagged) ? x.symbolsTagged.map((s: any) => String(s).toUpperCase()) : [],
    links: links
      .map((l: any) => ({
        url: String(l?.url ?? "").trim(),
        title: typeof l?.title === "string" ? l.title : undefined,
        source: typeof l?.source === "string" ? l.source : undefined
      }))
      .filter((l: any) => l.url),
    spam: {
      score: Number(spam.score ?? 0),
      reasons: Array.isArray(spam.reasons) ? spam.reasons.map((r: any) => String(r)) : [],
      normalizedHash: typeof spam.normalizedHash === "string" ? spam.normalizedHash : undefined
    }
  };
}

function asArrayMessages(v: any): MessageLite[] {
  if (!Array.isArray(v)) return [];
  const out: MessageLite[] = [];
  for (const x of v) {
    const m = safeMsg(x);
    if (m) out.push(m);
  }
  return out;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function comparePopular(a: MessageLite, b: MessageLite) {
  const al = a.likes ?? 0;
  const bl = b.likes ?? 0;
  if (bl !== al) return bl - al;

  const ar = a.replies ?? 0;
  const br = b.replies ?? 0;
  if (br !== ar) return br - ar;

  const af = a.user.followers ?? 0;
  const bf = b.user.followers ?? 0;
  if (bf !== af) return bf - af;

  return (b.id ?? 0) - (a.id ?? 0);
}

function buildKeyLinks(clean: MessageLite[], maxLinks = 12) {
  type LinkAgg = { url: string; title?: string; domain: string; count: number; lastSharedAt?: string };

  const map = new Map<string, LinkAgg>();

  for (const m of clean) {
    if (!m.links || m.links.length === 0) continue;
    const seen = new Set<string>();

    for (const l of m.links) {
      const url = String(l?.url ?? "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const existing = map.get(url);
      const createdAt = m.createdAt;

      if (!existing) {
        map.set(url, {
          url,
          title: l.title,
          domain: domainOf(url),
          count: 1,
          lastSharedAt: createdAt
        });
      } else {
        existing.count += 1;
        if (!existing.title && l.title) existing.title = l.title;

        if (!existing.lastSharedAt) {
          existing.lastSharedAt = createdAt;
        } else if (new Date(createdAt).getTime() > new Date(existing.lastSharedAt).getTime()) {
          existing.lastSharedAt = createdAt;
        }
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(b.lastSharedAt ?? 0).getTime() - new Date(a.lastSharedAt ?? 0).getTime();
    })
    .slice(0, maxLinks);
}

function extractNewsRows(payload: any, cutoffMs: number): DashboardResponse["news24h"] {
  const rows: DashboardResponse["news24h"] = [];
  const rawRows = Array.isArray(payload?.news) ? payload.news : Array.isArray(payload?.items) ? payload.items : [];

  for (const n of rawRows) {
    const id = Number(n?.id ?? n?.news_id ?? 0);
    const title = String(n?.title ?? n?.headline ?? "").trim();
    const url = String(n?.url ?? n?.link ?? "").trim();
    const source = String(n?.source ?? n?.site ?? n?.publisher ?? domainOf(url) ?? "StockTwits").trim() || "StockTwits";
    const publishedAt =
      typeof n?.published_at === "string"
        ? n.published_at
        : typeof n?.created_at === "string"
          ? n.created_at
          : typeof n?.publishedAt === "string"
            ? n.publishedAt
            : undefined;

    if (!id || !title || !url || !publishedAt) continue;
    const ts = new Date(publishedAt).getTime();
    if (!Number.isFinite(ts) || ts < cutoffMs) continue;

    rows.push({ id, title, url, source, publishedAt });
  }

  rows.sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime());
  return rows;
}

export default async (req: Request, _context: Context) => {
  try {
    const url = new URL(req.url);
    const symbol = requireSymbol(url.searchParams.get("symbol"));
    const cfg = TICKER_MAP[symbol];
    const spamThreshold = envFloat("SPAM_THRESHOLD", 0.75);

    const wlSet = new Set((cfg.whitelistUsers ?? []).map((u: any) => String(u.username ?? u).toLowerCase()));
    const wlName = new Map(
      (cfg.whitelistUsers ?? [])
        .map((u: any) => ({ username: String(u.username ?? u).toLowerCase(), name: u.name }))
        .filter((u: any) => u.username && u.name)
        .map((u: any) => [u.username, String(u.name)])
    );

    const enrich = (m: MessageLite): MessageLite => {
      const key = (m.user.username ?? "").toLowerCase();
      const name = wlName.get(key);
      if (!name) return m;
      if (m.user.displayName === name) return m;
      return { ...m, user: { ...m.user, displayName: m.user.displayName ?? name } };
    };

    const cutoff = hoursAgoDate(24);
    const cutoffMs = cutoff.getTime();
    const today = toUTCDateISO(new Date());
    const yesterday = toUTCDateISO(addDays(new Date(), -1));

    const [tRaw, yRaw, newsResult] = await Promise.all([
      getJSON<any>(kMsgs(symbol, today)),
      getJSON<any>(kMsgs(symbol, yesterday)),
      fetchSymbolNewsPage(symbol).then((v) => ({ ok: true as const, value: v })).catch(() => ({ ok: false as const, value: null }))
    ]);

    const tMsgs = asArrayMessages(tRaw);
    const yMsgs = asArrayMessages(yRaw);

    const combined = [...tMsgs, ...yMsgs]
      .filter((m) => new Date(m.createdAt).getTime() >= cutoffMs)
      .sort((a, b) => b.id - a.id);

    const total24h = combined.length;
    const clean = combined.filter((m) => (m.spam?.score ?? 0) < spamThreshold).map(enrich);

    const sentimentScore = clean.length > 0 ? clean.reduce((acc, m) => acc + (m.modelSentiment?.score ?? 0), 0) / clean.length : 0;
    const sentimentLabel = sentimentScore > 0.15 ? "bull" : sentimentScore < -0.15 ? "bear" : "neutral";

    const series = await loadSeries(symbol);
    const prev = series.days?.[yesterday];
    const prevMean = prev && prev.sentimentCountClean > 0 ? prev.sentimentSumClean / prev.sentimentCountClean : null;
    const vsPrevDay = prevMean === null ? null : sentimentScore - prevMean;

    const sortedDates = Object.keys(series.days ?? {}).sort();
    const last20 = sortedDates.slice(-20);
    const baseline = last20.length > 0 ? last20.reduce((acc, d) => acc + (series.days[d]?.volumeClean ?? 0), 0) / last20.length : null;
    const buzzMultiple = baseline && baseline > 0 ? clean.length / baseline : null;

    const popular = [...clean].sort(comparePopular).slice(0, 15);
    const highlights = clean
      .filter((m) => m.user.official || wlSet.has((m.user.username ?? "").toLowerCase()))
      .sort((a, b) => b.id - a.id)
      .slice(0, 25);

    const keyLinks = buildKeyLinks(clean, 12);

    const linksForSummary: { url: string; title?: string }[] = [];
    for (const m of clean) for (const l of m.links) linksForSummary.push({ url: l.url, title: l.title });

    const summary = build24hSummary({
      symbol,
      displayName: cfg.displayName,
      cleanMessages: clean,
      popular,
      links: linksForSummary,
      sentimentScore24h: sentimentScore,
      vsPrevDay
    }) as any;

    summary.keyLinks = keyLinks;

    const state = await getJSON<any>(kState(symbol));
    const currentWatchers = typeof state?.lastWatchers === "number" ? state.lastWatchers : null;
    const watcherDelta = (() => {
      if (currentWatchers == null || !Number.isFinite(currentWatchers)) {
        return { watchersDelta: null, watchersDeltaPct: null };
      }

      let baseline: number | null = null;
      const yesterdayWatchers = series?.days?.[yesterday]?.watchers;

      if (typeof yesterdayWatchers === "number" && Number.isFinite(yesterdayWatchers)) {
        baseline = yesterdayWatchers;
      } else {
        const priorDates = Object.keys(series?.days ?? {}).filter((d) => d < today).sort().reverse();
        for (const d of priorDates) {
          const w = series?.days?.[d]?.watchers;
          if (typeof w === "number" && Number.isFinite(w)) {
            baseline = w;
            break;
          }
        }
      }

      if (baseline == null) return { watchersDelta: null, watchersDeltaPct: null };

      const watchersDelta = currentWatchers - baseline;
      const watchersDeltaPct = baseline === 0 ? null : (watchersDelta / baseline) * 100;
      return {
        watchersDelta: Number(watchersDelta.toFixed(0)),
        watchersDeltaPct: watchersDeltaPct === null ? null : Number(watchersDeltaPct.toFixed(2))
      };
    })();

    const posts24h = [...clean]
      .sort((a, b) => {
        const bt = new Date(b.createdAt).getTime();
        const at = new Date(a.createdAt).getTime();
        if (bt !== at) return bt - at;
        return (b.id ?? 0) - (a.id ?? 0);
      })
      .slice(0, 400);

    const newsItems24h = newsResult.ok ? extractNewsRows(newsResult.value, cutoffMs).slice(0, 25) : [];

    const out: DashboardResponse = {
      symbol,
      displayName: cfg.displayName,
      lastSyncAt: state?.lastSyncAt ?? null,
      watchers: currentWatchers,
      watchersDelta: watcherDelta.watchersDelta,
      watchersDeltaPct: watcherDelta.watchersDeltaPct,
      sentiment24h: {
        score: Number(sentimentScore.toFixed(4)),
        label: sentimentLabel,
        sampleSize: clean.length,
        vsPrevDay: vsPrevDay === null ? null : Number(vsPrevDay.toFixed(4))
      },
      volume24h: {
        clean: clean.length,
        total: total24h,
        buzzMultiple: buzzMultiple === null ? null : Number(buzzMultiple.toFixed(2))
      },
      summary24h: summary,
      news24h: newsItems24h,
      newsUnavailable: !newsResult.ok,
      posts24h,
      popularPosts24h: popular,
      highlightedPosts: highlights,
      preview: {
        topPost: popular[0] ?? null,
        topHighlight: highlights[0] ?? null,
        topLink: keyLinks[0] ? { url: keyLinks[0].url, title: keyLinks[0].title, domain: keyLinks[0].domain, count: keyLinks[0].count } : null
      }
    };

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=15"
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};
