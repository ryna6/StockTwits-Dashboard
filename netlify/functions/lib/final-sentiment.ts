export type UserTagSentiment = "Bullish" | "Bearish" | null | undefined;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function userTagToIndex(userTag: UserTagSentiment): number | null {
  if (userTag === "Bullish") return 75;
  if (userTag === "Bearish") return 25;
  return null;
}

export function modelScoreToIndex(score: number | null | undefined): number {
  const s = Number(score);
  if (!Number.isFinite(s)) return 50;
  if (s >= 0 && s <= 100) return Math.round(s);
  return clamp(Math.round(((clamp(s, -1, 1) + 1) / 2) * 100), 0, 100);
}

export function labelFromIndex(index: number): "bull" | "neutral" | "bear" {
  if (index >= 55) return "bull";
  if (index <= 45) return "bear";
  return "neutral";
}

export function finalSentimentFrom(userTag: UserTagSentiment, modelScore: number | null | undefined) {
  const userIdx = userTagToIndex(userTag);
  const modelIdx = modelScoreToIndex(modelScore);
  const finalIndex = (() => {
    if (userIdx === null) return modelIdx;

    let candidate = userIdx;
    if (modelIdx >= 60) {
      candidate = userIdx + Math.round(0.25 * modelIdx);
    } else if (modelIdx <= 40) {
      candidate = userIdx - Math.round(0.25 * modelIdx);
    }

    return clamp(Math.round(candidate), 0, 100);
  })();

  return {
    finalSentimentIndex: finalIndex,
    finalSentimentLabel: labelFromIndex(finalIndex)
  };
}
