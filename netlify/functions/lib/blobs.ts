import { getStore } from "@netlify/blobs";

// Bump this to reset all stored data if your blobs contain old schema.
const STORE_NAME = "stcd-v2";

/**
 * IMPORTANT:
 * - Do NOT create a blobs store at module/global scope.
 * - In Netlify Functions, the Blobs environment may not be initialized until invocation time.
 * - Creating the store per operation also avoids the "Failed to decode token: Token expired"
 *   issue caused by reusing a warm store instance.
 */
function store() {
  try {
    // Zero-config path (preferred): Netlify auto-configures siteID/token at runtime.
    return getStore(STORE_NAME);
  } catch (e: any) {
    // Optional fallback (only if you manually provide creds in env vars).
    // This is here to make the error self-healing if your site is missing Blobs context.
    const siteID =
      process.env.BLOBS_SITE_ID ||
      process.env.NETLIFY_SITE_ID ||
      process.env.SITE_ID ||
      "";

    const token =
      process.env.BLOBS_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      process.env.NETLIFY_TOKEN ||
      "";

    if (siteID && token) {
      return getStore(STORE_NAME, { siteID, token });
    }

    // Re-throw original error if no fallback creds exist.
    throw e;
  }
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const v = await store().get(key, { type: "json" });
  return (v ?? null) as T | null;
}

export async function setJSON(
  key: string,
  value: unknown,
  opts?: Record<string, unknown>
) {
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
