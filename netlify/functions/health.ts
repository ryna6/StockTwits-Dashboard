import type { Context } from "@netlify/functions";

function has(v?: string) {
  return Boolean((v ?? "").trim());
}

export default async (_req: Request, _context: Context) => {
  const info = {
    ok: true,
    at: new Date().toISOString(),
    env: {
      has_BLOBS_SITE_ID: has(process.env.BLOBS_SITE_ID),
      has_BLOBS_TOKEN: has(process.env.BLOBS_TOKEN),
      // these should generally be false unless YOU set them:
      has_NETLIFY_SITE_ID: has(process.env.NETLIFY_SITE_ID),
      has_NETLIFY_AUTH_TOKEN: has(process.env.NETLIFY_AUTH_TOKEN)
    }
  };

  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};
