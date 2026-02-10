import { getStore } from "@netlify/blobs";

const STORE_NAME = "stcd-v2";

function isMissingBlobsEnv(err: any) {
  const msg = String(err?.message ?? err);
  return msg.includes("environment has not been configured to use Netlify Blobs");
}

function readCreds() {
  const siteID =
    (process.env.BLOBS_SITE_ID ||
      process.env.NETLIFY_SITE_ID ||
      process.env.SITE_ID ||
      "").trim();

  const token =
    (process.env.BLOBS_TOKEN ||
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      process.env.NETLIFY_TOKEN ||
      "").trim();

  return {
    siteID,
    token,
    hasSiteID: Boolean(siteID),
    hasToken: Boolean(token),
    // extra debug-only booleans (helps you confirm what's present at runtime)
    hasNetlifySiteIdEnv: Boolean((process.env.NETLIFY_SITE_ID || "").trim()),
    hasNetlifyAuthTokenEnv: Boolean((process.env.NETLIFY_AUTH_TOKEN || "").trim())
  };
}

async function withStore<T>(fn: (s: any) => Promise<T>): Promise<T> {
  // Attempt 1: zero-config (Netlify-injected context)
  try {
    const s = getStore(STORE_NAME);
    return await fn(s);
  } catch (e: any) {
    if (!isMissingBlobsEnv(e)) throw e;

    // Attempt 2: explicit creds
    const c = readCreds();
    if (c.siteID && c.token) {
      const s2 = getStore(STORE_NAME, { siteID: c.siteID, token: c.token });
      return await fn(s2);
    }

    throw new Error(
      [
        "Netlify Blobs runtime context is missing AND no manual creds were found.",
        "Set BLOBS_SITE_ID (Project ID) and BLOBS_TOKEN (Personal Access Token) in Netlify Environment variables, then redeploy (Clear cache + deploy).",
        `Detected: hasSiteID=${c.hasSiteID}, hasToken=${c.hasToken}, NETLIFY_SITE_ID=${c.hasNetlifySiteIdEnv}, NETLIFY_AUTH_TOKEN=${c.hasNetlifyAuthTokenEnv}`,
        `Original: ${String(e?.message ?? e)}`
      ].join(" ")
    );
  }
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const v = await withStore((s) => s.get(key, { type: "json" }));
  return (v ?? null) as T | null;
}

export async function setJSON(key: string, value: unknown, opts?: Record<string, unknown>) {
  const body = JSON.stringify(value);
  return await withStore((s) =>
    s.set(key, body, {
      metadata: { contentType: "application/json" },
      ...(opts ?? {})
    } as any)
  );
}

export async function delKey(key: string) {
  return await withStore((s) => s.delete(key));
}

export async function listKeys(prefix: string): Promise<string[]> {
  const res = await withStore((s) => s.list({ prefix } as any));
  const blobs = (res as any)?.blobs ?? [];
  return blobs.map((b: any) => b.key);
}

/** Key helpers */
export function kState(symbol: string) {
  return `state/${symbol.toUpperCase()}.json`;
}
export function kMsgs(symbol: string, date: string) {
  return `msgs/${symbol.toUpperCase()}/${date}.json`;
}
export function kSeries(symbol: string) {
  return `series/${symbol.toUpperCase()}.json`;
}
export function kPrice(symbol: string) {
  return `price/${symbol.toUpperCase()}.json`;
}
export function kHash(hash: string) {
  return `hash/${hash}.json`;
}
export function kLock(symbol: string) {
  return `lock/${symbol.toUpperCase()}.json`;
}
export function kNews(symbol: string) {
  return `news/${symbol.toUpperCase()}.json`;
}
