import type { Context } from "@netlify/functions";
import { getJSON, setJSON } from "./lib/blobs";
import { ECON_EVENTS_US, type EconEventDefinition } from "../../src/config/econEventsUS";
import { scrapeInvestingConsensus } from "./lib/investing";

type EconEventRow = {
  date: string;
  timeET: string | null;
  key: string;
  name: string;
  importance: "high" | "medium" | "low";
  actual: number | string | null;
  consensus: number | string | null;
  previous: number | string | null;
  change: number | null;
  pctChange: number | null;
  unit: string | null;
  goodBad: "good" | "bad" | "neutral";
};

type EconPayload = {
  meta: {
    start: string;
    end: string;
    lastUpdated: string;
    source: {
      schedule: "FRED";
      actuals: "FRED";
      consensus: "Investing.com scrape";
    };
    note: string;
  };
  events: EconEventRow[];
};

type CacheEnvelope = { expiresAt: number; payload: EconPayload };

const memCache = new Map<string, CacheEnvelope>();

const RELEASES_DATES_URL = "https://api.stlouisfed.org/fred/releases/dates";
const SERIES_OBS_URL = "https://api.stlouisfed.org/fred/series/observations";

function etDate(offsetDays = 0): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setDate(et.getDate() + offsetDays);
  return et.toISOString().slice(0, 10);
}

function ttlMs(start: string, end: string): number {
  if (start === end && start === etDate(0)) return 30 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

function numLike(raw: string | null | undefined): number | string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text || text === ".") return null;
  const normalized = text.replace(/,/g, "").trim();
  const suffix = normalized.match(/([kmb])$/i)?.[1]?.toLowerCase();
  const pct = normalized.endsWith("%");
  const base = normalized.replace(/[%kmb]/gi, "");
  const parsed = Number(base);
  if (!Number.isFinite(parsed)) return text;
  let out = parsed;
  if (suffix === "k") out *= 1_000;
  if (suffix === "m") out *= 1_000_000;
  if (suffix === "b") out *= 1_000_000_000;
  if (pct) return parsed;
  return out;
}

function classifyGoodBad(
  def: EconEventDefinition,
  actual: number | string | null,
  consensus: number | string | null,
  previous: number | string | null
): "good" | "bad" | "neutral" {
  const a = typeof actual === "number" ? actual : null;
  const c = typeof consensus === "number" ? consensus : null;
  const p = typeof previous === "number" ? previous : null;

  const surprise = a != null && c != null ? a - c : null;
  const delta = a != null && p != null ? a - p : null;
  const signal = surprise ?? delta;
  if (signal == null || def.goodDirection === "neutral" || signal === 0) return "neutral";
  const positiveGood = def.goodDirection === "higher_is_good";
  const isPositive = signal > 0;
  return positiveGood === isPositive ? "good" : "bad";
}

async function fredGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FRED request failed ${res.status}: ${url.pathname}`);
  return await res.json();
}

export default async (req: Request, _context: Context) => {
  try {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) throw new Error("Missing FRED_API_KEY");

    const url = new URL(req.url);
    const start = url.searchParams.get("start") ?? etDate(0);
    const end = url.searchParams.get("end") ?? etDate(7);
    const force = url.searchParams.get("force") === "1";

    const key = `econ:${start}:${end}`;
    const now = Date.now();

    if (!force) {
      const mem = memCache.get(key);
      if (mem && mem.expiresAt > now) {
        return new Response(JSON.stringify(mem.payload), { status: 200, headers: { "content-type": "application/json" } });
      }
      const cached = await getJSON<CacheEnvelope>(key);
      if (cached?.expiresAt && cached.expiresAt > now) {
        memCache.set(key, cached);
        return new Response(JSON.stringify(cached.payload), { status: 200, headers: { "content-type": "application/json" } });
      }
    }

    const releases = await fredGet(RELEASES_DATES_URL, {
      api_key: apiKey,
      file_type: "json",
      realtime_start: start,
      realtime_end: end,
      limit: "1000"
    });

    const releaseDates = Array.isArray(releases?.release_dates) ? releases.release_dates : [];

    const firstInRangeByRelease = new Map<string, string>();
    for (const r of releaseDates) {
      const releaseName = String(r?.release_name ?? "");
      const date = String(r?.date ?? "");
      if (!releaseName || !date || date < start || date > end) continue;
      const prev = firstInRangeByRelease.get(releaseName);
      if (!prev || date < prev) firstInRangeByRelease.set(releaseName, date);
    }

    const tracked = ECON_EVENTS_US.filter((e) => firstInRangeByRelease.has(e.fredReleaseName));

    const obsByKey = new Map<string, { actual: number | string | null; previous: number | string | null }>();
    await Promise.all(
      tracked.map(async (event) => {
        try {
          const obs = await fredGet(SERIES_OBS_URL, {
            series_id: event.fredSeriesId,
            api_key: apiKey,
            file_type: "json",
            sort_order: "desc",
            limit: "2"
          });
          const rows = Array.isArray(obs?.observations) ? obs.observations : [];
          const actual = numLike(rows[0]?.value ?? null);
          const previous = numLike(rows[1]?.value ?? null);
          obsByKey.set(event.key, { actual, previous });
        } catch (err) {
          console.error("[econ_calendar] observation fetch failed", { event: event.key, err });
          obsByKey.set(event.key, { actual: null, previous: null });
        }
      })
    );

    const consensusResult = await scrapeInvestingConsensus(start, end, tracked);

    const events: EconEventRow[] = tracked.map((event) => {
      const date = firstInRangeByRelease.get(event.fredReleaseName) ?? start;
      const obs = obsByKey.get(event.key) ?? { actual: null, previous: null };
      const consensus = consensusResult.values.get(`${date}:${event.key}`)?.consensus ?? null;

      const actualNum = typeof obs.actual === "number" ? obs.actual : null;
      const prevNum = typeof obs.previous === "number" ? obs.previous : null;

      const change = actualNum != null && prevNum != null ? actualNum - prevNum : null;
      const pctChange =
        change != null && prevNum != null && prevNum !== 0 ? (change / Math.abs(prevNum)) * 100 : null;

      return {
        date,
        timeET: event.typicalTimeET ?? null,
        key: event.key,
        name: event.displayName,
        importance: event.importance,
        actual: obs.actual,
        consensus,
        previous: obs.previous,
        change,
        pctChange,
        unit: event.unit ?? null,
        goodBad: classifyGoodBad(event, obs.actual, consensus, obs.previous)
      };
    });

    events.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const ta = a.timeET ?? "99:99";
      const tb = b.timeET ?? "99:99";
      if (ta !== tb) return ta.localeCompare(tb);
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.importance] - rank[b.importance];
    });

    const payload: EconPayload = {
      meta: {
        start,
        end,
        lastUpdated: new Date().toISOString(),
        source: {
          schedule: "FRED",
          actuals: "FRED",
          consensus: "Investing.com scrape"
        },
        note: "Release dates may not reflect when data is available on FRED. Consensus may be unavailable for some events/dates."
      },
      events
    };

    const expiry = Date.now() + (consensusResult.failed ? 15 * 60 * 1000 : ttlMs(start, end));
    const envelope: CacheEnvelope = { expiresAt: expiry, payload };
    memCache.set(key, envelope);
    await setJSON(key, envelope);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60"
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};
