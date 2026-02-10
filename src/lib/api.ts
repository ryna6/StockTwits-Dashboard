import type { DashboardResponse, StatsResponse } from "../../shared/types";

async function readError(r: Response): Promise<string> {
  const text = await r.text().catch(() => "");
  return text ? ` ${text}` : "";
}

function withCacheBust(url: string): string {
  // Avoid iOS Safari/PWA caching surprises
  const u = new URL(url, window.location.origin);
  u.searchParams.set("_ts", String(Date.now()));
  return u.toString();
}

async function fetchNoStore(url: string, init?: RequestInit): Promise<Response> {
  return fetch(withCacheBust(url), {
    ...(init ?? {}),
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      ...(init?.headers ?? {})
    }
  });
}

export async function apiConfig(): Promise<{ tickers: string[] }> {
  const r = await fetchNoStore("/api/config");
  if (!r.ok) throw new Error(`config failed: ${r.status}${await readError(r)}`);
  return (await r.json()) as { tickers: string[] };
}

export async function apiDashboard(symbol: string): Promise<DashboardResponse> {
  const r = await fetchNoStore(`/api/dashboard?symbol=${encodeURIComponent(symbol)}`);
  if (!r.ok) throw new Error(`dashboard failed: ${r.status}${await readError(r)}`);
  return (await r.json()) as DashboardResponse;
}

export async function apiStats(symbol: string): Promise<StatsResponse> {
  const r = await fetchNoStore(`/api/stats?symbol=${encodeURIComponent(symbol)}`);
  if (!r.ok) throw new Error(`stats failed: ${r.status}${await readError(r)}`);
  return (await r.json()) as StatsResponse;
}

export async function apiSync(symbol: string): Promise<{ ok: true; added: number; lastSeenId: number | null }> {
  const r = await fetchNoStore(`/api/sync?symbol=${encodeURIComponent(symbol)}`);
  if (!r.ok) throw new Error(`sync failed: ${r.status}${await readError(r)}`);
  return (await r.json()) as { ok: true; added: number; lastSeenId: number | null };
}
