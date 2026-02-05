import type { Context } from "@netlify/functions";

export default async (_req: Request, _context: Context) => {
  return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

