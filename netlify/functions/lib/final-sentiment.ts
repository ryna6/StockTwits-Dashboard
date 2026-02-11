export type UserTagSentiment = "Bullish" | "Bearish" | null | undefined;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function modelScoreToIndex(score: number): number {
  const s = Number.isFinite(score) ? score : 0;
  return clamp(Math.round((s + 1) * 50), 0, 100);
}

export function labelFromIndex(index: number): "bull" | "neutral" | "bear" {
  if (index >= 55) return "bull";
  if (index <= 45) return "bear";
  return "neutral";
}

export function finalSentimentFrom(userTag: UserTagSentiment, modelScore: number) {
  const finalIndex = userTag === "Bullish" ? 75 : userTag === "Bearish" ? 25 : modelScoreToIndex(modelScore);
  return {
    finalSentimentIndex: finalIndex,
    finalSentimentLabel: labelFromIndex(finalIndex)
  };
}
