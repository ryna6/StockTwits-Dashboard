import type { DashboardResponse, StatsResponse } from "../../shared/types";

async function readError(r: Response) {
  try {
    const t = await r.text();
    return t || `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

export async function apiConfig(): Promise<{ tickers: any[] }> {
  // Avoid iOS/PWA + CDN 304s returning an empty body (which breaks r.json()).
  const r = await fetch("/api/config", { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return await r.json();
}

export async function apiDashboard(symbol: string): Promise<DashboardResponse> {
  const r = await fetch(`/api/dashboard?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return await r.json();
}

export async function apiStats(symbol: string, rangeDays: 30 | 90 | 365 = 90): Promise<StatsResponse> {
  const r = await fetch(`/api/stats?symbol=${encodeURIComponent(symbol)}&rangeDays=${rangeDays}`, { cache: "no-store" });
  if (!r.ok) throw new Error(await readError(r));
  return await r.json();
}

export async function apiSync(symbol: string) {
  const r = await fetch(`/api/sync`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol })
  });
  if (!r.ok) throw new Error(await readError(r));
  return await r.json().catch(() => ({}));
}

export async function apiBackfill(symbol: string, days = 30) {
  const r = await fetch(`/api/backfill-background`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol, days })
  });
  return await r.json().catch(() => ({}));
}
