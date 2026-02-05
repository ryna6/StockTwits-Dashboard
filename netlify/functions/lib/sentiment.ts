const POS: Record<string, number> = {
  "beat": 2, "beats": 2, "guidance": 1.5, "upgrade": 2, "upgraded": 2,
  "contract": 2.5, "award": 2.5, "orders": 2, "order": 2, "partnership": 2,
  "revenue": 1.5, "growth": 2, "profitable": 2.5, "profit": 2,
  "approved": 2.5, "approval": 2.5, "faa": 1.5, "certification": 2,
  "bull": 1.5, "bullish": 2, "rip": 1.5, "moon": 2
};

const NEG: Record<string, number> = {
  "miss": -2, "missed": -2, "downgrade": -2, "downgraded": -2,
  "offering": -3, "dilution": -3, "dilutive": -3, "s-3": -2.5,
  "reverse": -2, "split": -1.5, "bankrupt": -4, "fraud": -4,
  "bear": -1.5, "bearish": -2, "dump": -2.5, "rug": -3,
  "lawsuit": -2.5, "investigation": -2.5
};

const STOP = new Set([
  "the","a","an","and","or","to","of","in","on","for","with","is","are","was","were","be","been",
  "this","that","it","as","at","by","from","im","we","you","they","i","me","my","our","your","their"
]);

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

export function modelSentiment(body: string | null | undefined): { score: number; label: "bull" | "neutral" | "bear" } {
  const text = (body ?? "").trim();
  if (!text) return { score: 0, label: "Neutral" };

  const toks = tokenize(text);
  if (toks.length === 0) return { score: 0, label: "neutral" };

  let s = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (STOP.has(t)) continue;

    let w = 0;
    if (t in POS) w = POS[t];
    if (t in NEG) w = NEG[t];

    // simple negation window
    const prev = toks.slice(Math.max(0, i - 3), i);
    const negated = prev.includes("not") || prev.includes("no") || prev.includes("never");
    if (negated) w *= -1;

    // simple intensity
    const intense = prev.includes("very") || prev.includes("huge") || prev.includes("massive");
    if (intense) w *= 1.25;

    s += w;
  }

  // normalize to [-1..1] with soft clipping
  const score = Math.max(-1, Math.min(1, s / 6));
  const label = score > 0.15 ? "bull" : score < -0.15 ? "bear" : "neutral";
  return { score, label };
}

