import { TICKER_MAP } from "../../../shared/tickers";

export function requireSymbol(raw: string | null | undefined): string {
  const sym = (raw ?? "").trim().toUpperCase();
  if (!sym) throw new Error("Missing symbol");
  if (!TICKER_MAP[sym]) throw new Error(`Symbol not allowed: ${sym}`);
  return sym;
}

export function parseRangeDays(raw: string | null | undefined): number {
  const n = Number(raw ?? "90");
  if (![30, 90, 365].includes(n)) return 90;
  return n;
}

export function envInt(name: string, fallback: number) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function envFloat(name: string, fallback: number) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

