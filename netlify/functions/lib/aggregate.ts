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
      watchers: number | null;
    }
  >;
};

function finalIndexForMessage(m: MessageLite): number {
  if (typeof m.finalSentimentIndex === "number") return m.finalSentimentIndex;
  return finalSentimentFrom(m.userSentiment ?? m.stSentimentBasic ?? null, m.modelSentiment?.score ?? 0).finalSentimentIndex;
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
        watchers: null
      });

    day.volumeTotal += 1;
    if (m.spam.score < Number(process.env.SPAM_THRESHOLD ?? "0.75")) {
      day.volumeClean += 1;
      day.sentimentSumClean += finalIndexForMessage(m);
      day.sentimentCountClean += 1;
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
    let mean = d && d.sentimentCountClean > 0 ? d.sentimentSumClean / d.sentimentCountClean : null;
    if (mean !== null && mean >= -1 && mean <= 1) mean = Math.round((mean + 1) * 50);
    return {
      date,
      volumeClean: d?.volumeClean ?? 0,
      volumeTotal: d?.volumeTotal ?? 0,
      sentimentMean: mean,
      watchers: d?.watchers ?? null
    };
  });
}
