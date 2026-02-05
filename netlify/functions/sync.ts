import type { Context } from "@netlify/functions";
import { requireSymbol } from "./lib/validate";
import { syncSymbol } from "./lib/ingest";

export default async (req: Request, _context: Context) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(req.url);
    const symbol = requireSymbol(url.searchParams.get("symbol"));

    const result = await syncSymbol(symbol);

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store"
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};

