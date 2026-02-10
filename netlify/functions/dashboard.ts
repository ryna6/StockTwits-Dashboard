import type { Handler } from "@netlify/functions";
import type { DashboardResponse, MessageLite, NewsItem } from "../../shared/types";
import { TICKER_MAP } from "../../shared/tickers";
import { getJSON, setJSON, kState, kMsgs, kNews } from "./lib/blobs";
import { utcDayKey, nowISO, parseISO, isWithinLastHours } from "./lib/time";
import { summarize24h } from "./lib/summarize";
import { spamThreshold } from "./lib/spam";
import { requireSymbol, envFloat, envInt } from "./lib/validate";
import { fetchSymbolNews } from "./lib/stocktwits";

type SymbolState = {
  lastSeenId: number | null;
  lastSyncAt: string | null;
  lastWatchers: number | null;
};

function domainOf(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export const handler: Handler = async (event) => {
  try {
    const symbol = requireSymbol(event.queryStringParameters?.symbol);

    const cfg = TICKER_MAP[symbol.toUpperCase()];
    const displayName = cfg?.displayName ?? symbol.toUpperCase();

    const state = (await getJSON<SymbolState>(kState(symbol))) ?? {
      lastSeenId: null,
      lastSyncAt: null,
      lastWatchers: null
    };

    const today = utcDayKey(new Date());
    const yesterday = utcDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const todayMsgs = (await getJSON<MessageLite[]>(kMsgs(symbol, today))) ?? [];
    const ydayMsgs = (await getJSON<MessageLite[]>(kMsgs(symbol, yesterday))) ?? [];

    const TH = envFloat("SPAM_THRESHOLD", spamThreshold());
    const cleanToday = todayMsgs.filter((m) => (m?.spam?.score ?? 0) < TH);
    const cleanYday = ydayMsgs.filter((m) => (m?.spam?.score ?? 0) < TH);

    // Only last 24h from clean messages (can span two days)
    const last24h = [...cleanToday, ...cleanYday].filter((m) => isWithinLastHours(m.createdAt, 24));
    last24h.sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());

    // Sentiment 24h
    const sScores = last24h.map((m) => m.modelSentiment?.score ?? 0);
    const sMean = sScores.length ? sScores.reduce((a, b) => a + b, 0) / sScores.length : 0;

    const sLabel =
      sMean > 0.08 ? "bull" : sMean < -0.08 ? "bear" : "neutral";

    // prev day sentiment mean (yesterday clean)
    const prevScores = cleanYday.map((m) => m.modelSentiment?.score ?? 0);
    const prevMean = prevScores.length ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length : null;

    const sentimentVsPrevDay =
      prevMean != null && prevScores.length
        ? (sMean - prevMean) // delta in [-2..2] units
        : null;

    // Volume 24h (clean vs total)
    const volumeClean24h = last24h.length;
    const volumeTotal24h = [...todayMsgs, ...ydayMsgs].filter((m) => isWithinLastHours(m.createdAt, 24)).length;

    const prevVolumeClean = cleanYday.length || null;
    const volVsPrevDay = prevVolumeClean ? (volumeClean24h - prevVolumeClean) / prevVolumeClean : null;

    // Build summary
    const summary24h = summarize24h(symbol, last24h);

    // keyLinks aggregation (from user shared links in clean posts) — NOT used for News card anymore
    const linkCount = new Map<string, { count: number; title?: string; lastAt: string }>();
    for (const m of last24h) {
      for (const l of m.links ?? []) {
        if (!l?.url) continue;
        const cur = linkCount.get(l.url);
        if (!cur) {
          linkCount.set(l.url, { count: 1, title: l.title, lastAt: m.createdAt });
        } else {
          cur.count += 1;
          if (!cur.title && l.title) cur.title = l.title;
          if (parseISO(m.createdAt).getTime() > parseISO(cur.lastAt).getTime()) cur.lastAt = m.createdAt;
        }
      }
    }
    const keyLinks = [...linkCount.entries()]
      .map(([url, v]) => ({
        url,
        domain: domainOf(url),
        count: v.count,
        title: v.title,
        lastSharedAt: v.lastAt
      }))
      .sort((a, b) => b.count - a.count || parseISO(b.lastSharedAt).getTime() - parseISO(a.lastSharedAt).getTime())
      .slice(0, 20);

    // Popular posts sorting: likes -> replies -> followers (tiny tie-break)
    const popularPosts24h = [...last24h]
      .sort((a, b) => {
        const la = a.likes ?? 0;
        const lb = b.likes ?? 0;
        if (lb !== la) return lb - la;
        const ra = a.replies ?? 0;
        const rb = b.replies ?? 0;
        if (rb !== ra) return rb - ra;
        const fa = a.user?.followers ?? 0;
        const fb = b.user?.followers ?? 0;
        return fb - fa;
      })
      .slice(0, 50);

    // Highlighted posts: official OR whitelisted usernames
    const whitelist = new Set((cfg?.whitelistUsers ?? []).map((u) => u.toLowerCase()));
    const highlightedPosts = last24h
      .filter((m) => !!m.user?.official || whitelist.has(m.user?.username?.toLowerCase?.() ?? ""))
      .sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime())
      .slice(0, 50);

    // posts24h payload cap
    const posts24h = last24h.slice(0, envInt("POSTS_24H_CAP", 200));

    // StockTwits News tab (cached in blobs)
    const NEWS_TTL_SECONDS = envInt("NEWS_TTL_SECONDS", 600);
    const cachedNews = (await getJSON<{ fetchedAt: string; items: NewsItem[] }>(kNews(symbol))) ?? null;

    let news: NewsItem[] = cachedNews?.items ?? [];
    const cachedAt = cachedNews?.fetchedAt ? Date.parse(cachedNews.fetchedAt) : 0;
    const isStale = !cachedAt || Date.now() - cachedAt > NEWS_TTL_SECONDS * 1000;

    if (isStale) {
      try {
        const fresh = await fetchSymbolNews(symbol, 20);
        news = fresh as NewsItem[];
        await setJSON(kNews(symbol), { fetchedAt: nowISO(), items: news });
      } catch {
        // If fetch fails, keep cached news if available.
      }
    }

    const out: DashboardResponse = {
      symbol: symbol.toUpperCase(),
      displayName,

      lastSyncAt: state.lastSyncAt ?? null,
      watchers: state.lastWatchers ?? null,

      sentiment24h: {
        label: sLabel as any,
        score: sMean,
        sampleSize: sScores.length,
        // We present "vsPrevDay" as a fraction-like value in UI for consistency; keep as delta for now.
        vsPrevDay: sentimentVsPrevDay
      },

      volume24h: {
        clean: volumeClean24h,
        total: volumeTotal24h,
        vsPrevDay: volVsPrevDay
      },

      summary24h: {
        ...summary24h,
        keyLinks
      },

      news,

      posts24h,
      popularPosts24h,
      highlightedPosts,

      preview: {
        topPost: posts24h[0],
        topHighlight: highlightedPosts[0],
        topLink: keyLinks[0]
      }
    };

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=15"
      },
      body: JSON.stringify(out)
    };
  } catch (e: any) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: e?.message ?? String(e) })
    };
  }
};
