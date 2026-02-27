import type { DashboardResponse, StatsResponse } from "../../shared/types";

async function readError(r: Response): Promise<string> {
  const text = await r.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return j?.error ? String(j.error) : (text || `${r.status} ${r.statusText}`);
  } catch {
    return text || `${r.status} ${r.statusText}`;
  }
}

export async function apiConfig(): Promise<{ tickers: any[] }> {
  const r = await fetch("/api/config");
  if (!r.ok) throw new Error(await readError(r));
  return await r.json();
}

export async function apiDashboard(symbol: string): Promise<DashboardResponse> {
  const r = await fetch(`/api/dashboard?symbol=${encodeURIComponent(symbol)}`);
  if (!r.ok) throw new Error(await readError(r));
  return await r.json();
}

export async function apiStats(symbol: string, range: 30 | 90 | 365): Promise<StatsResponse> {
  const r = await fetch(`/api/stats?symbol=${encodeURIComponent(symbol)}&range=${range}`);
  if (!r.ok) throw new Error(await readError(r));
  return await r.json();
}

export async function apiSync(symbol: string) {
  const r = await fetch(`/api/sync?symbol=${encodeURIComponent(symbol)}`, { method: "POST" });
  const text = await r.text().catch(() => "");
  let j: any = {};
  try { j = JSON.parse(text); } catch {}
  if (!r.ok || !j.ok) throw new Error(j?.error ? String(j.error) : (text || "Sync failed"));
  return j.result;
}

export async function apiBackfill(symbol: string, days = 30) {
  const r = await fetch(`/api/backfill-background`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol, days })
  });
  return await r.json().catch(() => ({}));
}

export type EconCalendarResponse = {
  meta: {
    start: string;
    end: string;
    lastUpdated: string;
    source: {
      schedule: string;
      actuals: string;
      consensus: string;
    };
    note: string;
  };
  events: Array<{
    date: string;
    timeET: string | null;
    key: string;
    name: string;
    importance: "high" | "medium" | "low";
    actual: number | string | null;
    consensus: number | string | null;
    previous: number | string | null;
    change: number | null;
    pctChange: number | null;
    unit: string | null;
    goodBad: "good" | "bad" | "neutral";
  }>;
};

export async function apiEconCalendar(start: string, end: string, force = false): Promise<EconCalendarResponse> {
  const q = new URLSearchParams({ start, end });
  if (force) q.set("force", "1");
  const r = await fetch(`/.netlify/functions/econ_calendar?${q.toString()}`);
  if (!r.ok) throw new Error(await readError(r));
  return await r.json();
}
