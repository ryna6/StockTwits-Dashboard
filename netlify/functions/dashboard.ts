import type { Context } from "@netlify/functions";
import type { DashboardResponse, MessageLite } from "../../shared/types";
import { TICKER_MAP } from "../../shared/tickers";
import { requireSymbol, envFloat } from "./lib/validate";
import { getJSON, kMsgs, kState } from "./lib/blobs";
import { hoursAgoDate, toUTCDateISO, addDays } from "./lib/time";
import { loadSeries } from "./lib/aggregate";
import { build24hSummary } from "./lib/summarize";

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

function comparePopular(a: MessageLite, b: MessageLite) {
  // User request: likes -> replies -> followers (followers much lower weight)
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
      if (m.user.displayName) return m;
      return { ...m, user: { ...m.user, displayName: name } };
    };

    const cutoff = hoursAgoDate(24);
    const today = toUTCDateISO(new Date());
    const yesterday = toUTCDateISO(addDays(new Date(), -1));

    const [tRaw, yRaw] = await Promise.all([getJSON<any>(kMsgs(symbol, today)), getJSON<any>(kMsgs(symbol, yesterday))]);

    const tMsgs = asArrayMessages(tRaw);
    const yMsgs = asArrayMessages(yRaw);

    const combined = [...tMsgs, ...yMsgs]
      .filter((m) => new Date(m.createdAt).getTime() >= cutoff.getTime())
      .sort((a, b) => b.id - a.id);

    const total24h = combined.length;
    const cleanRaw = combined.filter((m) => (m.spam?.score ?? 0) < spamThreshold);
    const clean = cleanRaw.map(enrich);

    const sentimentScore =
      clean.length > 0 ? clean.reduce((acc, m) => acc + (m.modelSentiment?.score ?? 0), 0) / clean.length : 0;
    const sentimentLabel = sentimentScore > 0.15 ? "bull" : sentimentScore < -0.15 ? "bear" : "neutral";

    const series = await loadSeries(symbol);

    // previous day mean sentiment from stored daily series
    const prev = series.days?.[yesterday];
    const prevMean = prev && prev.sentimentCountClean > 0 ? prev.sentimentSumClean / prev.sentimentCountClean : null;
    const vsPrevDay = prevMean === null ? null : sentimentScore - prevMean;

    // buzz baseline (average clean volume over last 20 stored days)
    const sortedDates = Object.keys(series.days ?? {}).sort();
    const last20 = sortedDates.slice(-20);
    const baseline =
      last20.length > 0
        ? last20.reduce((acc, d) => acc + (series.days[d]?.volumeClean ?? 0), 0) / last20.length
        : null;
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
      popular,
      sentimentScore24h: sentimentScore,
      vsPrevDay
    });

    const state = await getJSON<any>(kState(symbol));

    // clean posts in last 24h for expanded Summary view (bounded)
    const recentPosts24h = [...clean].sort((a, b) => b.id - a.id).slice(0, 200);

    const out: DashboardResponse = {
      symbol,
      displayName: cfg.displayName,
      lastSyncAt: state?.lastSyncAt ?? null,
      watchers: state?.lastWatchers ?? null,
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
      recentPosts24h,
      popularPosts24h: popular,
      highlightedPosts: highlights,
      preview: {
        topPost: popular[0] ?? null,
        topHighlight: highlights[0] ?? null,
        topLink: summary.keyLinks?.[0] ?? null
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
