import type { DashboardResponse, StatsResponse } from "../../shared/types";

export async function apiConfig(): Promise<{ tickers: any[] }> {
  const r = await fetch("/api/config");
  if (!r.ok) throw new Error("Failed to load config");
  return await r.json();
}

export async function apiDashboard(symbol: string): Promise<DashboardResponse> {
  const r = await fetch(`/api/dashboard?symbol=${encodeURIComponent(symbol)}`);
  if (!r.ok) throw new Error("Failed to load dashboard");
  return await r.json();
}

export async function apiStats(symbol: string, range: 30 | 90 | 365): Promise<StatsResponse> {
  const r = await fetch(`/api/stats?symbol=${encodeURIComponent(symbol)}&range=${range}`);
  if (!r.ok) throw new Error("Failed to load stats");
  return await r.json();
}

export async function apiSync(symbol: string) {
  const r = await fetch(`/api/sync?symbol=${encodeURIComponent(symbol)}`, { method: "POST" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j?.error ?? "Sync failed");
  return j.result;
}

export async function apiBackfill(symbol: string, days = 30) {
  const r = await fetch(`/api/backfill-background`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol, days })
  });
  // background function returns 202 immediately in production
  return await r.json().catch(() => ({}));
}

