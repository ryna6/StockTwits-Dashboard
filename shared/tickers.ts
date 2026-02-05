import type { TickerConfig } from "./types";

export const TICKERS: TickerConfig[] = [
  {
    symbol: "RCAT",
    displayName: "Red Cat Holdings",
    logoUrl: "https://logos.stocktwits-cdn.com/RCAT.png",
    whitelistUsers: [ 
      { username: "Duckworks", name: "Jeffrey Thompson (CEO)" }
    ]
  },
  {
    symbol: "UMAC",
    displayName: "Unusual Machines",
    logoUrl: "https://logos.stocktwits-cdn.com/UMAC.png",
    whitelistUsers: []
  },
  {
    symbol: "GRRR",
    displayName: "Gorilla Technology",
    logoUrl: "https://logos.stocktwits-cdn.com/GRRR.png",
    whitelistUsers: []
  },
  {
    symbol: "ACHR",
    displayName: "Archer Aviation",
    logoUrl: "https://logos.stocktwits-cdn.com/ACHR.png",
    whitelistUsers: []
  },
  {
    symbol: "FIG",
    displayName: "FIG",
    logoUrl: "https://logos.stocktwits-cdn.com/FIG.png",
    whitelistUsers: []
  }
];

// Quick lookup
export const TICKER_MAP: Record<string, TickerConfig> = Object.fromEntries(
  TICKERS.map((t) => [t.symbol.toUpperCase(), t])
);

