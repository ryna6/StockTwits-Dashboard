import type { Context } from "@netlify/functions";
import type { DashboardResponse, MessageLite } from "../../shared/types";
import { TICKER_MAP } from "../../shared/tickers";
import { requireSymbol, envFloat } from "./lib/validate";
import { getJSON, kMsgs, kState } from "./lib/blobs";
import { hoursAgoDate, toUTCDateISO, addDays } from "./lib/time";
import { loadSeries } from "./lib/aggregate";
import { build24hSummary } from "./lib/summarize";
import { fetchCompanyNews24h } from "./lib/finnhub";
import { finalSentimentFrom, labelFromIndex, modelScoreToIndex } from "./lib/final-sentiment";


function normalizeSentimentIndex(value: number | null | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= -1 && n <= 1) return modelScoreToIndex(n);
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeMsg(x: any): MessageLite | null {
  if (!x) return null;
  const createdAt = typeof x.createdAt === "string" ? x.createdAt : typeof x.created_at === "string" ? x.created_at : "";
  if (!createdAt) return null;

  const user = x.user ?? {};
  const links = Array.isArray(x.links) ? x.links : [];
  const modelSent = x.modelSentiment ?? {};
  const spam = x.spam ?? {};

  const stSentimentBasic = x.stSentimentBasic ?? null;
  const userSentiment = (x.userSentiment ?? stSentimentBasic) ?? null;
  const sentimentTagLabel = userSentiment === "Bullish" || userSentiment === "Bearish" ? userSentiment : "Neutral";
  const modelScore = Number(modelSent.score ?? 0);
  const fallbackFinal = finalSentimentFrom(userSentiment, modelScore);

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
    userSentiment: (x.userSentiment ?? x.stSentimentBasic) ?? null,
    sentimentTagLabel,
    modelSentiment: {
      score: modelScore,
      label: modelSent.label === "bull" || modelSent.label === "bear" || modelSent.label === "neutral" ? modelSent.label : "neutral"
    },
    finalSentimentIndex: fallbackFinal.finalSentimentIndex,
    finalSentimentLabel:
      x.finalSentimentLabel === "bull" || x.finalSentimentLabel === "bear" || x.finalSentimentLabel === "neutral"
        ? x.finalSentimentLabel
        : fallbackFinal.finalSentimentLabel,
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

function computeWatchersDelta(
  series: Awaited<ReturnType<typeof loadSeries>>,
  today: string,
  yesterday: string,
  currentWatchers: number | null
) {
  const todayWatchers = series.days?.[today]?.watchers ?? null;
  const prevWatchers = series.days?.[yesterday]?.watchers ?? null;
  const latest = todayWatchers ?? currentWatchers;
  if (latest === null || prevWatchers === null) {
    return { watchersDelta: null };
  }

  const watchersDelta = latest - prevWatchers;
  return { watchersDelta };
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

    const [tRaw, yRaw, news24h] = await Promise.all([
      getJSON<any>(kMsgs(symbol, today)),
      getJSON<any>(kMsgs(symbol, yesterday)),
      fetchCompanyNews24h(symbol).catch(() => [])
    ]);

    const combined = [...asArrayMessages(tRaw), ...asArrayMessages(yRaw)]
      .filter((m) => new Date(m.createdAt).getTime() >= cutoffMs)
      .sort((a, b) => b.id - a.id);

    const total24h = combined.length;
    const clean = combined.filter((m) => (m.spam?.score ?? 0) < spamThreshold).map(enrich);

    const taggedSentimentPosts = clean.filter((m) => {
      const userTag = m.userSentiment ?? m.stSentimentBasic ?? null;
      return userTag === "Bullish" || userTag === "Bearish";
    });

    const userTagIndices = taggedSentimentPosts.map((m) => {
      const userTag = m.userSentiment ?? m.stSentimentBasic ?? null;
      return userTag === "Bullish" ? 75 : 25;
    });

    const sentimentScoreRaw =
      userTagIndices.length > 0 ? userTagIndices.reduce((acc, idx) => acc + idx, 0) / userTagIndices.length : 0;
    const sentimentScore = Math.max(0, Math.min(100, Math.round(sentimentScoreRaw)));
    const sentimentLabel = labelFromIndex(sentimentScore);

    const series = await loadSeries(symbol);
    const prev = series.days?.[yesterday];
    const prevMeanRaw = prev && prev.sentimentCountClean > 0 ? prev.sentimentSumClean / prev.sentimentCountClean : null;
    const prevMean = normalizeSentimentIndex(prevMeanRaw);
    const vsPrevDay = userTagIndices.length === 0 || prevMean === null ? null : Math.round(sentimentScore - prevMean);

    const sortedDates = Object.keys(series.days ?? {}).sort();
    const last20 = sortedDates.slice(-20);
    const baseline = last20.length > 0 ? last20.reduce((acc, d) => acc + (series.days[d]?.volumeClean ?? 0), 0) / last20.length : null;
    const buzzMultiple = baseline && baseline > 0 ? clean.length / baseline : null;

    const popular = [...clean].sort(comparePopular).slice(0, 15);
    const highlights = clean
      .filter((m) => m.user.official || wlSet.has((m.user.username ?? "").toLowerCase()))
      .sort((a, b) => b.id - a.id)
      .slice(0, 25);

    const summary = build24hSummary({
      symbol,
      displayName: cfg.displayName,
      cleanMessages: clean,
      highlights,
      sentimentScore24h: sentimentScore,
      vsPrevDay
    });

    const state = await getJSON<any>(kState(symbol));
    const currentWatchers = typeof state?.lastWatchers === "number" ? state.lastWatchers : null;
    const watcherDelta = computeWatchersDelta(series, today, yesterday, currentWatchers);

    const posts24h = [...clean]
      .sort((a, b) => {
        const bt = new Date(b.createdAt).getTime();
        const at = new Date(a.createdAt).getTime();
        if (bt !== at) return bt - at;
        return (b.id ?? 0) - (a.id ?? 0);
      })
      .slice(0, 400);

    const bullishTagCount = clean.filter((m) => m.userSentiment === "Bullish" || m.stSentimentBasic === "Bullish").length;
    const bearishTagCount = clean.filter((m) => m.userSentiment === "Bearish" || m.stSentimentBasic === "Bearish").length;
    const userTagOnlyIndices: number[] = [];
    for (const m of clean) {
      if (m.userSentiment === "Bullish" || m.stSentimentBasic === "Bullish") userTagOnlyIndices.push(75);
      else if (m.userSentiment === "Bearish" || m.stSentimentBasic === "Bearish") userTagOnlyIndices.push(25);
    }
    const userTagOnlyMean =
      userTagOnlyIndices.length > 0
        ? Math.round(userTagOnlyIndices.reduce((acc, v) => acc + v, 0) / userTagOnlyIndices.length)
        : null;

    console.log(
      `[sentiment-debug] ${symbol} bullishTags=${bullishTagCount} bearishTags=${bearishTagCount} userTagMean=${userTagOnlyMean ?? "n/a"} finalIndex=${sentimentScore} sample=${userTagIndices.length}`
    );

    const out: DashboardResponse = {
      symbol,
      displayName: cfg.displayName,
      lastSyncAt: state?.lastSyncAt ?? null,
      watchers: currentWatchers,
      watchersDelta: watcherDelta.watchersDelta,
      sentiment24h: {
        score: sentimentScore,
        label: sentimentLabel,
        sampleSize: userTagIndices.length,
        vsPrevDay
      },
      volume24h: {
        clean: clean.length,
        total: total24h,
        buzzMultiple: buzzMultiple === null ? null : Number(buzzMultiple.toFixed(2))
      },
      summary24h: summary,
      news24h: news24h.slice(0, 25),
      posts24h,
      popularPosts24h: popular,
      highlightedPosts: highlights,
      preview: {
        topPost: popular[0] ?? null,
        topHighlight: highlights[0] ?? null
      }
    };

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=15" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};
