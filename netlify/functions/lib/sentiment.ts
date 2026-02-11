const POS: Record<string, number> = {
  "beat": 80, "beats": 80, "guidance": 70, "upgrade": 85, "upgraded": 85,
  "contract": 88, "award": 88, "orders": 82, "order": 82, "partnership": 85,
  "revenue": 72, "growth": 80, "profitable": 86, "profit": 78,
  "approved": 88, "approval": 88, "faa": 68, "certification": 76,
  "bull": 72, "bullish": 78, "rip": 70, "moon": 82
};

const NEG: Record<string, number> = {
  "miss": 25, "missed": 25, "downgrade": 20, "downgraded": 20,
  "offering": 12, "dilution": 10, "dilutive": 10, "s-3": 18,
  "reverse": 24, "split": 30, "bankrupt": 10, "fraud": 10,
  "bear": 30, "bearish": 25, "dump": 15, "rug": 10,
  "lawsuit": 18, "investigation": 18
};

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "was", "were", "be", "been",
  "this", "that", "it", "as", "at", "by", "from", "im", "we", "you", "they", "i", "me", "my", "our", "your", "their"
]);

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\$[a-zA-Z]{1,6}/g, " $ticker ")
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function invertAroundNeutral(score: number) {
  return clamp(100 - score, 0, 100);
}

function applyIntensity(score: number) {
  const distance = score - 50;
  return clamp(50 + distance * 1.15, 0, 100);
}

export function modelSentiment(body: string | null | undefined): { score: number; label: "bull" | "neutral" | "bear" } {
  const text = (body ?? "").trim();
  if (!text) return { score: 50, label: "neutral" };

  const toks = tokenize(text);
  if (toks.length === 0) return { score: 50, label: "neutral" };

  const tokenScores: number[] = [];

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (STOP.has(t)) continue;

    let score: number | null = null;
    if (t in POS) score = POS[t];
    if (t in NEG) score = NEG[t];
    if (score === null) continue;

    const prev = toks.slice(Math.max(0, i - 3), i);
    const negated = prev.includes("not") || prev.includes("no") || prev.includes("never");
    const intense = prev.includes("very") || prev.includes("huge") || prev.includes("massive");

    let adjusted = score;
    if (negated) adjusted = invertAroundNeutral(adjusted);
    if (intense) adjusted = applyIntensity(adjusted);

    tokenScores.push(adjusted);
  }

  const score =
    tokenScores.length > 0
      ? Math.round(tokenScores.reduce((acc, v) => acc + v, 0) / tokenScores.length)
      : 50;

  const label = score >= 55 ? "bull" : score <= 45 ? "bear" : "neutral";
  return { score, label };
}
