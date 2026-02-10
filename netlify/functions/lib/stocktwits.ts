export type Cursor = {
  max: number;
  since: number;
  more: boolean;
};

const API_BASE = "https://api.stocktwits.com/api/2";
const WEB_BASE = "https://stocktwits.com";

export type StockTwitsMessage = {
  id: number;
  created_at: string;
  body: string;
  sentiment?: { basic: "Bullish" | "Bearish" | null };
  user: {
    id: number;
    username: string;
    name?: string;
    avatar_url?: string;
    official?: boolean;
    followers: number;
    join_date?: string;
  };
  likes?: { total: number };
  replies?: { total: number };
  symbols?: Array<{ symbol: string }>;
  links?: Array<{ url: string; title?: string; source?: string }>;
};

export type StockTwitsStreamResponse = {
  cursor: Cursor;
  messages: StockTwitsMessage[];
};

export async function fetchSymbolStreamPage(sym: string, max?: number): Promise<StockTwitsStreamResponse> {
  const url = new URL(`${API_BASE}/streams/symbol/${encodeURIComponent(sym)}.json`);
  if (max != null) url.searchParams.set("max", String(max));

  const r = await fetch(url.toString(), {
    headers: {
      "user-agent": "stcd/1.0 (+netlify)",
      accept: "application/json"
    }
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`StockTwits stream error ${r.status}: ${text.slice(0, 200)}`);
  }

  return (await r.json()) as StockTwitsStreamResponse;
}

export function extractWatchersFromMessages(_messages: any[]): number | null {
  // StockTwits doesn't always include a simple watcher count in this endpoint.
  // If you later add a symbol "show" endpoint, wire it here.
  return null;
}

// --------------------------------------------------------------------------------------
// StockTwits News Tab (symbol news) — server-side only
// We intentionally fetch from StockTwits' public symbol News page to mirror the "News" tab.
// --------------------------------------------------------------------------------------

export type StockTwitsNewsItem = {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  category?: string;
};

function asISODate(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
    return undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Heuristic: seconds vs ms
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return undefined;
    return d.toISOString();
  }
  return undefined;
}

function domainOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function extractNextData(html: string): any | null {
  const m = html.match(/<script[^>]*id=\"__NEXT_DATA__\"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function looksLikeNewsObj(x: any): boolean {
  if (!x || typeof x !== "object") return false;
  const title = x.title ?? x.headline ?? x.name;
  const url = x.url ?? x.link ?? x.canonical_url ?? x.article_url ?? x.permalink;
  if (typeof title !== "string" || title.trim().length < 8) return false;
  if (typeof url !== "string" || url.trim().length < 8) return false;
  return true;
}

function collectNewsFromObject(root: any): any[] {
  const out: any[] = [];
  const seen = new Set<any>();
  const stack: any[] = [root];
  let steps = 0;

  while (stack.length && steps++ < 5000) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      if (node.length && node.some(looksLikeNewsObj)) {
        for (const it of node) if (looksLikeNewsObj(it)) out.push(it);
      }
      for (const it of node) stack.push(it);
      continue;
    }

    for (const k of Object.keys(node)) stack.push((node as any)[k]);
  }

  return out;
}

function normalizeNews(raw: any[], limit: number): StockTwitsNewsItem[] {
  const items: StockTwitsNewsItem[] = [];
  const seenUrl = new Set<string>();

  for (const x of raw) {
    const title = String(x.title ?? x.headline ?? x.name ?? "").trim();
    let url = String(x.url ?? x.link ?? x.canonical_url ?? x.article_url ?? x.permalink ?? "").trim();
    if (!title || !url) continue;
    if (url.startsWith("/")) url = WEB_BASE + url;
    if (!/^https?:\/\//i.test(url)) continue;

    const source =
      (typeof x.source === "string" ? x.source : undefined) ??
      (typeof x.provider === "string" ? x.provider : undefined) ??
      (typeof x.publisher === "string" ? x.publisher : undefined) ??
      (typeof x.source_name === "string" ? x.source_name : undefined) ??
      (typeof x?.source?.name === "string" ? x.source.name : undefined) ??
      domainOf(url);

    const publishedAt =
      asISODate(x.published_at) ??
      asISODate(x.publishedAt) ??
      asISODate(x.created_at) ??
      asISODate(x.createdAt) ??
      asISODate(x.date) ??
      asISODate(x.time);

    const category =
      (typeof x.category === "string" ? x.category : undefined) ??
      (typeof x.section === "string" ? x.section : undefined) ??
      undefined;

    if (seenUrl.has(url)) continue;
    seenUrl.add(url);

    items.push({ title, url, source, publishedAt, category });
    if (items.length >= limit) break;
  }

  return items;
}

function parseNewsFromAnchors(html: string, limit: number): StockTwitsNewsItem[] {
  const items: StockTwitsNewsItem[] = [];
  const seen = new Set<string>();

  // Pull anchors; keep external-looking links and StockTwits news article links.
  const re = /<a\s+[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) && items.length < limit) {
    let href = decodeHtmlEntities(String(m[1] ?? "").trim());
    if (!href) continue;
    if (href.startsWith("/")) href = WEB_BASE + href;
    if (!/^https?:\/\//i.test(href)) continue;

    const text = decodeHtmlEntities(stripTags(m[2] ?? "")).trim();
    if (text.length < 20 || text.length > 180) continue;

    // Skip obvious nav links
    const tl = text.toLowerCase();
    if (["log in", "sign up", "home", "messages", "watchlist", "trending"].includes(tl)) continue;

    let allow = true;
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "stocktwits.com") {
        // Only keep stocktwits links that look like actual news/article routes
        allow = u.pathname.includes("/news");
      }
    } catch {
      allow = false;
    }
    if (!allow) continue;

    if (seen.has(href)) continue;
    seen.add(href);

    items.push({
      title: text,
      url: href,
      source: domainOf(href)
    });
  }

  return items;
}

export async function fetchSymbolNews(symbol: string, limit = 20): Promise<StockTwitsNewsItem[]> {
  const sym = symbol.toUpperCase();
  const url = `${WEB_BASE}/symbol/${encodeURIComponent(sym)}/news`;

  const r = await fetch(url, {
    headers: {
      "user-agent": "stcd/1.0 (+netlify)",
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`StockTwits news page error ${r.status}: ${text.slice(0, 200)}`);
  }

  const html = await r.text();

  // 1) Best-case: parse embedded Next.js data (more likely to contain timestamps/source/urls)
  const nextData = extractNextData(html);
  if (nextData) {
    const raw = collectNewsFromObject(nextData);
    const normalized = normalizeNews(raw, limit);
    if (normalized.length) return normalized;
  }

  // 2) Fallback: heuristic anchor parsing
  return parseNewsFromAnchors(html, limit);
}
