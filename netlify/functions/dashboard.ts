import type { Context } from "@netlify/functions";
import type { DashboardResponse, MessageLite } from "../../shared/types";
import { TICKER_MAP } from "../../shared/tickers";
import { requireSymbol, envFloat } from "./lib/validate";
import { getJSON, kMsgs, kState } from "./lib/blobs";
import { hoursAgoDate, toUTCDateISO, addDays } from "./lib/time";
import { loadSeries } from "./lib/aggregate";
import { build24hSummary } from "./lib/summarize";

function scorePopular(m: MessageLite) {
  return m.likes + 2 * m.replies + Math.min(50, Math.floor((m.user.followers ?? 0) / 200));
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export default async (req: Request, _context: Context) => {
  try {
    const url = new URL(req.url);
    const symbol = requireSymbol(url.searchParams.get("symbol"));
    const cfg = TICKER_MAP[symbol];
    const spamThreshold = envFloat("SPAM_THRESHOLD", 0.75);

    const wlSet = new Set((cfg.whitelistUsers ?? []).map((u) => u.username.toLowerCase()));
    const wlName = new Map(
      (cfg.whitelistUsers ?? [])
        .filter((u) => u.username && u.name)
        .map((u) => [u.username.toLowerCase(), u.name as string])
    );

    const enrich = (m: MessageLite): MessageLite => {
      const key = (m.user.username ?? "").toLowerCase();
      const name = wlName.get(key);
      if (!name) return m;
      if (m.user.displayName === name) return m;
      return { ...m, user: { ...m.user, displayName: m.user.displayName ?? name } };
    };

    const cutoff = hoursAgoDate(24);
    const today = toUTCDateISO(new Date());
    const yesterday = toUTCDateISO(addDays(new Date(), -1));

    const [tMsgs, yMsgs] = await Promise.all([
      getJSON<MessageLite[]>(kMsgs(symbol, today)),
      getJSON<MessageLite[]>(kMsgs(symbol, yesterday))
    ]);

    const combined = [...(tMsgs ?? []), ...(yMsgs ?? [])]
      .filter((m) => new Date(m.createdAt).getTime() >= cutoff.getTime())
      .sort((a, b) => b.id - a.id);

    const total24h = combined.length;
    const cleanRaw = combined.filter((m) => m.spam.score < spamThreshold);
    const clean = cleanRaw.map(enrich);

    const sentimentScore =
      clean.length > 0 ? clean.reduce((acc, m) => acc + m.modelSentiment.score, 0) / clean.length : 0;
    const sentimentLabel = sentimentScore > 0.15 ? "bull" : sentimentScore < -0.15 ? "bear" : "neutral";

    const series = await loadSeries(symbol);
    const prevDay = yesterday;
    const prev = series.days?.[prevDay];
    const prevMean =
      prev && prev.sentimentCountClean > 0 ? prev.sentimentSumClean / prev.sentimentCountClean : null;
    const vsPrevDay = prevMean === null ? null : sentimentScore - prevMean;

    // baseline 20-day average volume
    const sortedDates = Object.keys(series.days ?? {}).sort();
    const last20 = sortedDates.slice(-20);
    const baseline =
      last20.length > 0
        ? last20.reduce((acc, d) => acc + (series.days[d]?.volumeClean ?? 0), 0) / last20.length
        : null;

    const buzzMultiple = baseline && baseline > 0 ? clean.length / baseline : null;

    const popular = [...clean]
      .sort((a, b) => scorePopular(b) - scorePopular(a))
      .slice(0, 15);

    const highlights = clean
      .filter((m) => m.user.official || wlSet.has((m.user.username ?? "").toLowerCase()))
      .sort((a, b) => b.id - a.id)
      .slice(0, 25);

    // links
    const links: { url: string; title?: string }[] = [];
    for (const m of clean) for (const l of m.links) links.push({ url: l.url, title: l.title });

    const summary = build24hSummary({
      symbol,
      displayName: cfg.displayName,
      cleanMessages: clean,
      popular,
      links,
      sentimentScore24h: sentimentScore,
      vsPrevDay
    });

    const state = await getJSON<any>(kState(symbol));

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
      popularPosts24h: popular,
      highlightedPosts: highlights,
      preview: {
        topPost: popular[0] ?? null,
        topHighlight: highlights[0] ?? null,
        topLink: summary.keyLinks?.[0]
          ? { ...summary.keyLinks[0], domain: domainOf(summary.keyLinks[0].url) }
          : null
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
