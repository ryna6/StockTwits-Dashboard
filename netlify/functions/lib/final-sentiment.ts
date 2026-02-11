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
  const hasModel = Number.isFinite(Number(modelScore));
  const modelIdx = modelScoreToIndex(modelScore);
  const finalIndex =
    userIdx === null
      ? modelIdx
      : hasModel
        ? clamp(Math.round(0.75 * userIdx + 0.25 * modelIdx), 0, 100)
        : userIdx;

  return {
    finalSentimentIndex: finalIndex,
    finalSentimentLabel: labelFromIndex(finalIndex)
  };
}
