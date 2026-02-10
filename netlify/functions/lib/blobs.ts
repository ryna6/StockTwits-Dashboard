import { getStore } from "@netlify/blobs";

const STORE_NAME = "stcd-v2";

function store() {
  // 1) Preferred: zero-config in Netlify Functions
  try {
    return getStore(STORE_NAME);
  } catch (e: any) {
    // 2) Manual fallback via env vars (recommended if your site isn't injecting context)
    const siteID = process.env.BLOBS_SITE_ID?.trim() || "";
    const token = process.env.BLOBS_TOKEN?.trim() || "";

    if (siteID && token) {
      return getStore(STORE_NAME, { siteID, token });
    }

    // Throw a more actionable error
    throw new Error(
      [
        "Netlify Blobs is not configured for this runtime.",
        "Fix: set BLOBS_SITE_ID (Project ID) and BLOBS_TOKEN (Personal Access Token) in Netlify Environment variables, then redeploy.",
        `Original: ${e?.message || String(e)}`
      ].join(" ")
    );
  }
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const v = await store().get(key, { type: "json" });
  return (v ?? null) as T | null;
}

export async function setJSON(key: string, value: unknown, opts?: Record<string, unknown>) {
  const body = JSON.stringify(value);
  return await store().set(key, body, {
    metadata: { contentType: "application/json" },
    ...(opts ?? {})
  } as any);
}

export async function delKey(key: string) {
  return await store().delete(key);
}

export async function listKeys(prefix: string): Promise<string[]> {
  const res = await store().list({ prefix } as any);
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
