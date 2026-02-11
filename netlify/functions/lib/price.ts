import { getJSON, setJSON, kPrice } from "./blobs";

type PriceStore = {
  symbol: string;
  updatedAt: string;
  candles: Record<string, { o: number; h: number; l: number; c: number; v: number }>;
};

const PRICE_TTL_MS = 12 * 60 * 60 * 1000;

export async function loadPrice(symbol: string): Promise<PriceStore> {
  const existing = await getJSON<PriceStore>(kPrice(symbol));
  if (existing?.symbol) return existing;
  return { symbol, updatedAt: new Date(0).toISOString(), candles: {} };
}

export async function ensurePriceRange(symbol: string, fromUnix: number, toUnix: number) {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (!token) return;

  const ps = await loadPrice(symbol);
  const lastUpdated = new Date(ps.updatedAt).getTime();
  if (Number.isFinite(lastUpdated) && Date.now() - lastUpdated < PRICE_TTL_MS) return;

  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", "D");
  url.searchParams.set("from", String(fromUnix));
  url.searchParams.set("to", String(toUnix));
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return;

  const data = (await res.json()) as any;
  if (data?.s !== "ok") return;

  for (let i = 0; i < data.t.length; i++) {
    const date = new Date(data.t[i] * 1000).toISOString().slice(0, 10);
    ps.candles[date] = { o: data.o[i], h: data.h[i], l: data.l[i], c: data.c[i], v: data.v[i] };
  }

  ps.updatedAt = new Date().toISOString();
  await setJSON(kPrice(symbol), ps);
}

export function priceCloseForDate(ps: PriceStore, date: string): number | null {
  return ps.candles[date]?.c ?? null;
}
