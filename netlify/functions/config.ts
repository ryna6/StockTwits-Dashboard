import type { Context } from "@netlify/functions";
import { TICKERS } from "../../shared/tickers";

export default async (_req: Request, _context: Context) => {
  return new Response(JSON.stringify({ tickers: TICKERS }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=60"
    }
  });
};

