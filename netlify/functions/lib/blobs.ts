import { getStore } from "@netlify/blobs";

// Bump this to reset all stored data if your blobs contain old schema.
const STORE_NAME = "stcd-v2";

let storeInstance: ReturnType<typeof getStore> | null = null;

function store() {
  if (storeInstance) return storeInstance;
  storeInstance = getStore(STORE_NAME);
  return storeInstance;
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
