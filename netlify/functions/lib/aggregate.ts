import type { MessageLite } from "../../../shared/types";
import { getJSON, setJSON, kSeries } from "./blobs";
import { toUTCDateISO } from "./time";
import { finalSentimentFrom } from "./final-sentiment";

type SeriesStore = {
  symbol: string;
  updatedAt: string;
  days: Record<
    string,
    {
      date: string;
      volumeTotal: number;
      volumeClean: number;
      sentimentSumClean: number;
      sentimentCountClean: number;
      userSentimentSumClean: number;
      userSentimentCountClean: number;
      watchers: number | null;
    }
  >;
};

function userSentimentToIndex(v: MessageLite["userSentiment"]): number | null {
  if (v === "Bullish") return 75;
  if (v === "Bearish") return 25;
  return null;
}

function finalIndexForMessage(m: MessageLite): number {
  if (typeof m.finalSentimentIndex === "number" && Number.isFinite(m.finalSentimentIndex)) {
    return Math.max(0, Math.min(100, Math.round(m.finalSentimentIndex)));
  }
  return finalSentimentFrom(m.userSentiment ?? m.stSentimentBasic, m.modelSentiment?.score ?? 0).finalSentimentIndex;
}

export async function loadSeries(symbol: string): Promise<SeriesStore> {
  const existing = await getJSON<SeriesStore>(kSeries(symbol));
  if (existing?.symbol) return existing;
  return { symbol, updatedAt: new Date().toISOString(), days: {} };
}

export async function updateSeries(symbol: string, newMessages: MessageLite[], watchers: number | null) {
  const series = await loadSeries(symbol);

  for (const m of newMessages) {
    const date = toUTCDateISO(new Date(m.createdAt));
    const day =
      series.days[date] ??
      (series.days[date] = {
        date,
        volumeTotal: 0,
        volumeClean: 0,
        sentimentSumClean: 0,
        sentimentCountClean: 0,
        userSentimentSumClean: 0,
        userSentimentCountClean: 0,
        watchers: null
      });

    day.volumeTotal += 1;
    if (m.spam.score < Number(process.env.SPAM_THRESHOLD ?? "0.75")) {
      day.volumeClean += 1;
      day.sentimentSumClean += finalIndexForMessage(m);
      day.sentimentCountClean += 1;

      const us = userSentimentToIndex(m.userSentiment ?? m.stSentimentBasic ?? null);
      if (us !== null) {
        day.userSentimentSumClean += us;
        day.userSentimentCountClean += 1;
      }
    }
  }

  if (watchers !== null) {
    const today = toUTCDateISO(new Date());
    const d =
      series.days[today] ??
      (series.days[today] = {
        date: today,
        volumeTotal: 0,
        volumeClean: 0,
        sentimentSumClean: 0,
        sentimentCountClean: 0,
        userSentimentSumClean: 0,
        userSentimentCountClean: 0,
        watchers: null
      });
    d.watchers = watchers;
  }

  const keys = Object.keys(series.days).sort();
  if (keys.length > 420) {
    const toDrop = keys.slice(0, keys.length - 420);
    for (const k of toDrop) delete series.days[k];
  }

  series.updatedAt = new Date().toISOString();
  await setJSON(kSeries(symbol), series);
}

export function seriesToPoints(series: SeriesStore, dates: string[]) {
  return dates.map((date) => {
    const d = series.days[date];
    const combinedMean = d && d.sentimentCountClean > 0 ? d.sentimentSumClean / d.sentimentCountClean : null;
    const userMean = d && d.userSentimentCountClean > 0 ? d.userSentimentSumClean / d.userSentimentCountClean : null;

    let sentimentMean: number | null = combinedMean;
    if (combinedMean === null && userMean !== null) sentimentMean = userMean;

    return {
      date,
      volumeClean: d?.volumeClean ?? 0,
      volumeTotal: d?.volumeTotal ?? 0,
      sentimentMean,
      watchers: d?.watchers ?? null
    };
  });
}
