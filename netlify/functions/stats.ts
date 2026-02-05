import type { Context } from "@netlify/functions";
import type { StatsResponse } from "../../shared/types";
import { requireSymbol, parseRangeDays } from "./lib/validate";
import { loadSeries, seriesToPoints } from "./lib/aggregate";
import { daysBackList } from "./lib/time";
import { loadPrice, ensurePriceRange, priceCloseForDate } from "./lib/price";

export default async (req: Request, _context: Context) => {
  try {
    const url = new URL(req.url);
    const symbol = requireSymbol(url.searchParams.get("symbol"));
    const rangeDays = parseRangeDays(url.searchParams.get("range"));

    const dates = daysBackList(rangeDays);

    // Ensure price is available (optional; no-op without FINNHUB_API_KEY)
    const fromUnix = Math.floor(new Date(dates[0] + "T00:00:00Z").getTime() / 1000);
    const toUnix = Math.floor(Date.now() / 1000);
    await ensurePriceRange(symbol, fromUnix, toUnix);

    const [series, price] = await Promise.all([loadSeries(symbol), loadPrice(symbol)]);

    const base = seriesToPoints(series, dates);
    const points = base.map((p) => ({
      ...p,
      close: priceCloseForDate(price, p.date)
    }));

    const hasWatchers = points.some((p) => typeof p.watchers === "number" && p.watchers !== null);
    const hasPrice = points.some((p) => typeof p.close === "number" && p.close !== null);

    const out: StatsResponse = { symbol, rangeDays, points, hasWatchers, hasPrice };

    return new Response(JSON.stringify(out), {
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

