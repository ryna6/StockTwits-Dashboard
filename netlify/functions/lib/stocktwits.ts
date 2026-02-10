export type StockTwitsMessage = any;

export type StockTwitsStreamResponse = {
  messages: StockTwitsMessage[];
  cursor?: { more?: boolean; max?: number; since?: number };
};

export async function fetchSymbolStreamPage(symbol: string, max?: number): Promise<StockTwitsStreamResponse> {
  const url = new URL(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`);
  if (typeof max === "number" && Number.isFinite(max)) {
    url.searchParams.set("max", String(max));
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "StockTwits Catalyst Dashboard (Netlify Functions)"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`StockTwits error ${res.status}: ${text.slice(0, 250)}`);
  }

  return (await res.json()) as StockTwitsStreamResponse;
}

export function extractWatchersFromMessages(symbol: string, messages: any[]): number | null {
  const sym = symbol.toUpperCase();
  for (const m of messages ?? []) {
    const arr = m?.symbols ?? [];
    const found = arr.find((s: any) => String(s?.symbol ?? "").toUpperCase() === sym);
    if (found && typeof found.watchlist_count === "number") return found.watchlist_count;
  }
  return null;
}


export type StockTwitsNewsResponse = {
  news?: any[];
  cursor?: { more?: boolean; max?: number; since?: number };
};

export async function fetchSymbolNewsPage(symbol: string): Promise<StockTwitsNewsResponse> {
  const url = new URL(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`);
  url.searchParams.set("filter", "news");

  const res = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "StockTwits Catalyst Dashboard (Netlify Functions)"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`StockTwits news error ${res.status}: ${text.slice(0, 250)}`);
  }

  return (await res.json()) as StockTwitsNewsResponse;
}
