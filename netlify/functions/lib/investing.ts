import type { EconEventDefinition } from "../../../src/config/econEventsUS";

type ConsensusHit = {
  key: string;
  date: string;
  consensus: number | string | null;
  consensusUnit: string | null;
};

const INV_URL = "https://www.investing.com/economic-calendar/";

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9% ]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumericLike(raw: string): number | string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  const cleaned = trimmed.replace(/,/g, "");
  const suffix = cleaned.match(/([kmb])$/i)?.[1]?.toLowerCase() ?? null;
  const pct = cleaned.endsWith("%");
  const base = cleaned.replace(/[%kmb]/gi, "");
  const num = Number(base);
  if (!Number.isFinite(num)) return trimmed;
  let out = num;
  if (suffix === "k") out *= 1_000;
  if (suffix === "m") out *= 1_000_000;
  if (suffix === "b") out *= 1_000_000_000;
  if (pct) return num;
  return out;
}

function dateFromAttr(raw: string, fallbackDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 1_000_000_000) {
    const d = new Date(asNum * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return fallbackDate;
}

function eventMatches(rowLabel: string, def: EconEventDefinition): boolean {
  const normalized = normalizeText(rowLabel);
  const matcher = def.investingMatcher;
  const containsOk = (matcher.contains ?? []).some((term) => normalized.includes(normalizeText(term)));
  if (containsOk) return true;
  if (matcher.regex) {
    try {
      return new RegExp(matcher.regex, "i").test(rowLabel);
    } catch {
      return false;
    }
  }
  return false;
}

export async function scrapeInvestingConsensus(
  start: string,
  end: string,
  events: EconEventDefinition[]
): Promise<{ values: Map<string, ConsensusHit>; failed: boolean }> {
  const values = new Map<string, ConsensusHit>();
  try {
    const res = await fetch(INV_URL, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; StockTwitsDashboardBot/1.0; +https://www.netlify.com)",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    if (!res.ok) throw new Error(`Investing fetch failed: ${res.status}`);

    const html = await res.text();
    const rowRegex = /<tr[^>]*class="[^"]*js-event-item[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html))) {
      const row = rowMatch[0];
      const rowBody = rowMatch[1];
      const dateAttr = row.match(/data-event-datetime="([^"]+)"/)?.[1] ?? "";
      const date = dateFromAttr(dateAttr, start);
      if (date < start || date > end) continue;

      const country = stripTags(row.match(/flagCur\s+noWrap"[^>]*>([\s\S]*?)<\//i)?.[1] ?? "");
      if (!/united states|usd/i.test(country)) continue;

      const title = stripTags(row.match(/class="event"[^>]*>([\s\S]*?)<\//i)?.[1] ?? "");
      if (!title) continue;

      const forecastRaw = stripTags(rowBody.match(/class="(?:fore|forecast)"[^>]*>([\s\S]*?)<\//i)?.[1] ?? "");
      const consensus = parseNumericLike(forecastRaw);

      for (const def of events) {
        if (!eventMatches(title, def)) continue;
        const key = `${date}:${def.key}`;
        values.set(key, {
          key: def.key,
          date,
          consensus,
          consensusUnit: /%/.test(forecastRaw) ? "%" : null
        });
        break;
      }
    }

    return { values, failed: false };
  } catch (err) {
    console.error("[econ_calendar] investing scrape failed", err);
    return { values, failed: true };
  }
}
