import { createHash } from "node:crypto";
import { envFloat, envInt } from "./validate";
import { getJSON, setJSON, kHash } from "./blobs";

const DEFAULT_DUP_WINDOW_MIN = 120;
const DEFAULT_DUP_SYM_THRESHOLD = 3;

function stripUrls(s: string) {
  return s.replace(/https?:\/\/\S+/g, " ");
}

function normalizeBody(body: string) {
  return stripUrls(body)
    .toLowerCase()
    .replace(/\$[a-zA-Z]{1,6}/g, "$TICKER")
    .replace(/[^a-z0-9\s$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedHash(body: string): string {
  const norm = normalizeBody(body);
  return createHash("sha1").update(norm).digest("hex");
}

export async function updateDuplicateState(hash: string, symbol: string, createdAtISO: string): Promise<number> {
  const windowMin = envInt("DUPLICATE_WINDOW_MINUTES", DEFAULT_DUP_WINDOW_MIN);
  const cutoff = Date.now() - windowMin * 60 * 1000;

  const key = kHash(hash);
  const existing = (await getJSON<any>(key)) ?? null;

  const createdAt = new Date(createdAtISO).getTime();
  const record =
    existing && typeof existing.lastSeenAt === "string" && new Date(existing.lastSeenAt).getTime() >= cutoff
      ? existing
      : { hash, symbols: {}, lastSeenAt: createdAtISO };

  record.symbols = record.symbols ?? {};
  record.symbols[symbol] = (record.symbols[symbol] ?? 0) + 1;
  record.lastSeenAt = createdAtISO;

  await setJSON(key, record);

  return Object.keys(record.symbols).length;
}

export function spamScore(args: {
  body: string;
  symbolsTaggedCount: number;
  cashtagCount: number;
  tokenCount: number;
  followers: number;
  accountAgeDays: number | null;
  duplicateSymbolsCount: number;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // ticker stuffing
  if (args.symbolsTaggedCount >= 5) {
    score = Math.max(score, 0.9);
    reasons.push("ticker_stuffing");
  }

  // cashtag density
  const density = args.tokenCount > 0 ? args.cashtagCount / args.tokenCount : 0;
  if (args.cashtagCount >= 3 && density >= 0.3) {
    score = Math.max(score, 0.85);
    reasons.push("cashtag_density");
  }

  // promo keywords (low weight)
  const promo = /\b(telegram|discord|signal group|join my|free alert|whatsapp)\b/i.test(args.body);
  if (promo) {
    score = Math.max(score, 0.55);
    reasons.push("promo_keywords");
  }

  // cross-ticker duplicate blasting
  const dupThresh = envInt("DUPLICATE_SYMBOL_THRESHOLD", DEFAULT_DUP_SYM_THRESHOLD);
  if (args.duplicateSymbolsCount >= dupThresh) {
    score = Math.max(score, 0.95);
    reasons.push("cross_ticker_duplicate");
  }

  // weak user heuristic
  if (args.followers <= 5 && args.accountAgeDays !== null && args.accountAgeDays <= 30 && args.body.length <= 60) {
    score = Math.max(score, 0.6);
    reasons.push("low_rep_short_post");
  }

  return { score: Math.min(1, score), reasons };
}

export function countCashtags(body: string) {
  return (body.match(/\$[A-Za-z]{1,6}\b/g) ?? []).length;
}

export function countTokens(body: string) {
  return body
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^A-Za-z0-9$]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

