import type { Context, Config } from "@netlify/functions";
import { TICKERS } from "../../shared/tickers";
import { syncSymbol } from "./lib/ingest";

export const config: Config = {
  schedule: "*/5 * * * *"
};

export default async (_req: Request, _context: Context) => {
  // Scheduled functions have tight limits; keep bounded. :contentReference[oaicite:7]{index=7}
  const results: any[] = [];
  for (const t of TICKERS) {
    try {
      results.push(await syncSymbol(t.symbol.toUpperCase()));
    } catch (e: any) {
      results.push({ symbol: t.symbol.toUpperCase(), error: String(e?.message ?? e) });
    }
  }
  // response body ignored in prod schedule executions
  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

