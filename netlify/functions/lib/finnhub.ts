import { getJSON, kNews, setJSON } from "./blobs";

export type FinnhubNewsItem = {
  id: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  datetime: number;
};

type FinnhubCompanyNewsRaw = {
  id?: number | string;
  headline?: string;
  summary?: string;
  url?: string;
  source?: string;
  datetime?: number;
};

type NewsCachePayload = {
  fetchedAt: number;
  items: FinnhubNewsItem[];
};

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1/company-news";
const CACHE_TTL_MS = 10 * 60 * 1000;
const RANGE_DAYS_BACK = 3;

function utcDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSummary(rawSummary: string, headline: string): string {
  const base = String(rawSummary ?? "").trim();
  if (!base) return `${headline}.`; 

  const sentences = toSentences(base);
  if (sentences.length >= 2) {
    const selected = sentences.slice(0, 3);
    if (selected.length === 3 && selected.join(" ").length > 330) return selected.slice(0, 2).join(" ");
    return selected.join(" ");
  }

  const compact = base.replace(/\s+/g, " ").trim();
  if (!compact) return `${headline}.`;

  const fallback = compact.slice(0, 300).trim();
  return fallback.endsWith(".") || fallback.endsWith("!") || fallback.endsWith("?") ? fallback : `${fallback}.`;
}

function itemId(raw: FinnhubCompanyNewsRaw): string {
  if (raw.id !== undefined && raw.id !== null && String(raw.id).trim()) return String(raw.id);
  const url = String(raw.url ?? "").trim();
  if (url) return url;
  const dt = Number(raw.datetime ?? 0);
  const headline = String(raw.headline ?? "").trim().slice(0, 48);
  return `news-${dt}-${headline}`;
}

function sanitizeRawItems(items: FinnhubCompanyNewsRaw[], cutoffSeconds: number): FinnhubNewsItem[] {
  const out: FinnhubNewsItem[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const datetime = Number(raw?.datetime ?? 0);
    if (!Number.isFinite(datetime) || datetime < cutoffSeconds) continue;

    const headline = String(raw?.headline ?? "").trim();
    const url = String(raw?.url ?? "").trim();
    if (!headline || !url) continue;

    const id = itemId(raw);
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      headline,
      summary: normalizeSummary(String(raw?.summary ?? ""), headline),
      url,
      source: String(raw?.source ?? "Finnhub").trim() || "Finnhub",
      datetime
    });
  }

  return out.sort((a, b) => b.datetime - a.datetime);
}

async function fetchFinnhubNews(symbol: string): Promise<FinnhubCompanyNewsRaw[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("Missing FINNHUB_API_KEY");

  const toDate = new Date();
  const fromDate = new Date(Date.now() - RANGE_DAYS_BACK * 24 * 60 * 60 * 1000);

  const url = new URL(FINNHUB_BASE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", utcDateISO(fromDate));
  url.searchParams.set("to", utcDateISO(toDate));
  url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "StockTwits Catalyst Dashboard (Netlify Functions)"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Finnhub company-news error ${res.status}: ${text.slice(0, 250)}`);
  }

  const payload = (await res.json()) as unknown;
  return Array.isArray(payload) ? (payload as FinnhubCompanyNewsRaw[]) : [];
}

export async function fetchCompanyNews24h(symbol: string, opts?: { forceRefresh?: boolean }): Promise<FinnhubNewsItem[]> {
  const cacheKey = kNews(symbol);
  const nowMs = Date.now();
  const cutoffSeconds = Math.floor((nowMs - 24 * 60 * 60 * 1000) / 1000);

  if (!opts?.forceRefresh) {
    const cached = await getJSON<NewsCachePayload>(cacheKey);
    if (cached?.fetchedAt && Array.isArray(cached?.items) && nowMs - cached.fetchedAt < CACHE_TTL_MS) {
      return sanitizeRawItems(cached.items as unknown as FinnhubCompanyNewsRaw[], cutoffSeconds);
    }
  }

  const rawItems = await fetchFinnhubNews(symbol);
  const items = sanitizeRawItems(rawItems, cutoffSeconds);

  const payload: NewsCachePayload = { fetchedAt: nowMs, items };
  await setJSON(cacheKey, payload);

  return items;
}
