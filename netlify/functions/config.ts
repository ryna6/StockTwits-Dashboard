import type { Context } from "@netlify/functions";
import { TICKERS } from "../../shared/tickers";

export default async (_req: Request, _context: Context) => {
  const tickers = TICKERS.map((t) => ({
    logoUrl: t.logoUrl ?? null,
    symbol: t.symbol,
    displayName: t.displayName
  }));

  return new Response(JSON.stringify({ ok: true, tickers }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300"
    }
  });
};
