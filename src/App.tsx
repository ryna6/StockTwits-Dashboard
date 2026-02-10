import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardResponse, StatsResponse } from "../shared/types";
import { apiConfig, apiDashboard, apiStats, apiSync } from "./lib/api";
import { fmtInt, timeAgo } from "./lib/format";
import Card from "./components/Card";
import PostsList from "./components/PostsList";
import NewsList from "./components/NewsList";
import TickerPicker from "./components/TickerPicker";
import ChartPanel from "./components/ChartPanel";

type CardKey = "sentiment" | "volume" | "summary" | "news" | "popular" | "highlights" | "charts";
type TickerOpt = { symbol: string; displayName: string; logoUrl?: string };

// ======= EDIT THESE ONLY if you want different card titles =======
const TITLES = {
  sentiment: "Sentiment",
  volume: "Message Volume",
  summary: "Summary",
  news: "News",
  popular: "Popular Posts",
  highlights: "Key Users",
  charts: "Advanced Stats"
};
// ================================================================

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function labelText(label: "bull" | "bear" | "neutral") {
  switch (label) {
    case "bull":
      return "Bullish";
    case "bear":
      return "Bearish";
    default:
      return "Neutral";
  }
}

// Map [-1..+1] to [0..100], 50 neutral
function sentimentToIndex(score: number) {
  const s = Number.isFinite(score) ? score : 0;
  return clamp(Math.round((s + 1) * 50), 0, 100);
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

type Change = {
  from: number;
  to: number;
  diff: number;
  pct: number | null;
};

function computeChange(series: number[], stepsBack: number): Change | null {
  if (!series.length) return null;
  const to = series[series.length - 1];
  const i = series.length - 1 - stepsBack;
  if (i < 0) return null;
  const from = series[i];
  const diff = to - from;
  const pct = from !== 0 ? diff / from : null;
  return { from, to, diff, pct };
}

function pctText(pct: number | null) {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const v = Math.round(pct * 1000) / 10;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}%`;
}

function lastNonNull<T>(arr: T[], get: (x: T) => any): number[] {
  const out: number[] = [];
  for (const x of arr) {
    const v = get(x);
    if (v == null) continue;
    if (!Number.isFinite(v)) continue;
    out.push(v);
  }
  return out;
}

export default function App() {
  const [tickers, setTickers] = useState<TickerOpt[]>([]);
  const [symbol, setSymbol] = useState<string>("RCAT");

  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const lastSuccessfulLoadRef = useRef<number>(0);

  // collapsed state for cards
  const [collapsed, setCollapsed] = useState<Record<CardKey, boolean>>({
    sentiment: false,
    volume: false,
    summary: false,
    news: true,
    popular: true,
    highlights: true,
    charts: true
  });

  // chart range
  const [range, setRange] = useState<"1m" | "3m" | "12m">("3m");

  const selectedTicker = useMemo(() => {
    const s = symbol.toUpperCase();
    const found = tickers.find((t) => t.symbol.toUpperCase() === s);
    return found ?? { symbol: s, displayName: s };
  }, [symbol, tickers]);

  const titleText = useMemo(() => {
    if (selectedTicker?.displayName) return `${selectedTicker.symbol} — ${selectedTicker.displayName}`;
    if (!dash) return symbol || "—";
    return `${dash.symbol} — ${dash.displayName}`;
  }, [dash, selectedTicker, symbol]);

  const topThemesText = useMemo(() => {
    const themes = (dash as any)?.summary24h?.themes ?? [];
    if (!themes.length) return "—";
    // supports both [{name,count}] and string[]
    if (typeof themes[0] === "string") return themes.slice(0, 3).join(", ");
    return themes.slice(0, 3).map((t: any) => t.name).join(", ");
  }, [dash]);

  const mostShared = useMemo(() => {
    const k = (dash as any)?.summary24h?.keyLinks?.[0];
    if (!k) return null;
    return k.title ?? k.url ?? null;
  }, [dash]);

  // ----- Load config + data -----
  async function loadConfig() {
    try {
      const cfg = await apiConfig();
      const list = (cfg?.tickers ?? []).map((sym: string) => {
        const up = sym.toUpperCase();
        return { symbol: up, displayName: up } as TickerOpt;
      });
      if (list.length) setTickers(list);
    } catch {
      // non-fatal
    }
  }

  async function loadAll(sym: string) {
    setLoading(true);
    setError("");
    try {
      const d = await apiDashboard(sym);
      setDash(d);
      const s = await apiStats(sym);
      setStats(s);
      lastSuccessfulLoadRef.current = Date.now();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshNow() {
    setLoading(true);
    setError("");
    try {
      await apiSync(symbol);
      await loadAll(symbol);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfig().catch(() => {});
    loadAll(symbol).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAll(symbol).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (lastSuccessfulLoadRef.current === 0) return;
      const age = Date.now() - lastSuccessfulLoadRef.current;
      if (age > 8 * 60 * 1000) refreshNow().catch(() => {});
    };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Stats-derived series for deltas -----
  const points = (stats as any)?.series ?? [];

  const sentDaily = useMemo(() => {
    return lastNonNull(points as any[], (p: any) => p.sentimentMean);
  }, [points]);

  const sentDailyIdx = useMemo(() => sentDaily.map((s) => sentimentToIndex(s)), [sentDaily]);

  const sent1d = useMemo(() => computeChange(sentDailyIdx, 1), [sentDailyIdx]);
  const sent1w = useMemo(() => computeChange(sentDailyIdx, 5), [sentDailyIdx]);
  const sent1m = useMemo(() => computeChange(sentDailyIdx, 21), [sentDailyIdx]);

  const sentNowIdx = sentDailyIdx.length
    ? sentDailyIdx[sentDailyIdx.length - 1]
    : dash
    ? sentimentToIndex(dash.sentiment24h.score)
    : 50;

  const volDaily = useMemo(() => {
    return lastNonNull(points as any[], (p: any) => p.volumeClean);
  }, [points]);

  const vol1d = useMemo(() => computeChange(volDaily, 1), [volDaily]);
  const vol1w = useMemo(() => computeChange(volDaily, 5), [volDaily]);
  const vol1m = useMemo(() => computeChange(volDaily, 21), [volDaily]);

  const volNow = volDaily.length ? volDaily[volDaily.length - 1] : dash?.volume24h?.clean ?? 0;

  const toneText = dash ? labelText(dash.sentiment24h.label) : "Neutral";

  // ---- timestamps for “sent x ago” ----
  const summarySentAt = (dash as any)?.posts24h?.[0]?.createdAt ?? dash?.summary24h?.evidencePosts?.[0]?.createdAt ?? null;
  const popularSentAt = dash?.preview?.topPost?.createdAt ?? null;
  const highlightsSentAt = dash?.preview?.topHighlight?.createdAt ?? null;

  // StockTwits "News" tab items (server-provided). Keep this null-safe to avoid first-render crashes.
  const newsItems = (((dash as any)?.news ?? []) as any[]) ?? [];
  const topNews = newsItems[0] ?? null;
  const newsPublishedAt = topNews?.publishedAt ?? null;
  const newsLinks = useMemo(() => {
    return (newsItems ?? []).map((n: any) => ({
      url: n?.url,
      title: n?.title,
      domain: (n?.source ?? safeDomain(n?.url) ?? "stocktwits") as string,
      lastSharedAt: n?.publishedAt
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash]);

  return (
    <div className="app">
      <div className="topSafe" />

      <header
        className="header"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch"
        }}
      >
        <div className="brandTitle">StockTwits Dashboard</div>

        <div className="headerRow">
          <div className="headerLeft">
            <div className="headerTicker">
              <div className="headerSymbol">{selectedTicker.symbol}</div>
              <div className="headerName">{selectedTicker.displayName}</div>
            </div>

            <div className="headerMeta">
              <span>Last sync: {dash?.lastSyncAt ? timeAgo(dash.lastSyncAt) : "—"}</span>
              <span className="dot">•</span>
              <span>Watchers: {dash?.watchers != null ? fmtInt(dash.watchers) : "—"}</span>
            </div>
          </div>

          <div className="headerRight">
            <TickerPicker
              tickers={tickers.length ? tickers : [{ symbol: "RCAT", displayName: "RCAT" }]}
              value={symbol}
              onChange={setSymbol}
            />
            <button className="btn refreshBtn" onClick={refreshNow} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="headerSubRow">
          <div className="headerTitle">{titleText}</div>
          {error ? <div className="error">{error}</div> : null}
        </div>
      </header>

      {dash ? (
        <main className="grid">
          {/* SENTIMENT */}
          <Card
            title={TITLES.sentiment}
            collapsed={collapsed.sentiment}
            onToggle={() => setCollapsed((c) => ({ ...c, sentiment: !c.sentiment }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  <div className={"sentLabel " + dash.sentiment24h.label}>{toneText}</div>
                  <div className="sentNumber">{sentNowIdx}</div>
                  <div className="sentOutOf">/100</div>
                </div>
                <div className="overviewStamp">vs prev day: {pctText(dash.sentiment24h.vsPrevDay as any)}</div>
              </div>
            }
          >
            <div className="deltaGrid">
              <div className="deltaRow">
                <div className="deltaLabel">1D</div>
                <div className="deltaValue">{sent1d ? pctText(sent1d.pct) : "—"}</div>
              </div>
              <div className="deltaRow">
                <div className="deltaLabel">1W</div>
                <div className="deltaValue">{sent1w ? pctText(sent1w.pct) : "—"}</div>
              </div>
              <div className="deltaRow">
                <div className="deltaLabel">1M</div>
                <div className="deltaValue">{sent1m ? pctText(sent1m.pct) : "—"}</div>
              </div>
            </div>
          </Card>

          {/* VOLUME */}
          <Card
            title={TITLES.volume}
            collapsed={collapsed.volume}
            onToggle={() => setCollapsed((c) => ({ ...c, volume: !c.volume }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  <div className="bigNum">{fmtInt(volNow)}</div>
                  <div className="muted">clean</div>
                </div>
                <div className="overviewStamp">vs prev day: {pctText(dash.volume24h.vsPrevDay as any)}</div>
              </div>
            }
          >
            <div className="deltaGrid">
              <div className="deltaRow">
                <div className="deltaLabel">1D</div>
                <div className="deltaValue">{vol1d ? pctText(vol1d.pct) : "—"}</div>
              </div>
              <div className="deltaRow">
                <div className="deltaLabel">1W</div>
                <div className="deltaValue">{vol1w ? pctText(vol1w.pct) : "—"}</div>
              </div>
              <div className="deltaRow">
                <div className="deltaLabel">1M</div>
                <div className="deltaValue">{vol1m ? pctText(vol1m.pct) : "—"}</div>
              </div>
            </div>
          </Card>

          {/* SUMMARY */}
          <Card
            title={TITLES.summary}
            collapsed={collapsed.summary}
            onToggle={() => setCollapsed((c) => ({ ...c, summary: !c.summary }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  <div className="summaryOverview">
                    <p>
                      <span className="summaryLabel">Retail tone:</span> {labelText(dash.sentiment24h.label)} ({sentNowIdx})
                    </p>
                    <p>
                      <span className="summaryLabel">Top themes:</span> {topThemesText}
                    </p>
                    <p>
                      <span className="summaryLabel">Most shared link:</span> {mostShared ?? "—"}
                    </p>
                  </div>
                </div>
                {summarySentAt ? <div className="overviewStamp">sent {timeAgo(summarySentAt)}</div> : null}
              </div>
            }
          >
            <div className="section">
              <div className="sectionTitle">Retail tone</div>
              <div className="tldr">
                {labelText(dash.sentiment24h.label)} ({sentNowIdx}) · 24h sentiment (spam-filtered)
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">Most shared link</div>
              <div className="tldr">{mostShared ?? "No links found."}</div>
            </div>

            <div className="section">
              <div className="sectionTitle">Top themes</div>
              <div className="chips">
                {((dash as any).summary24h.themes ?? []).map((t: any) => (
                  <span key={t.name ?? t} className="chip">
                    {typeof t === "string" ? t : `${t.name} · ${t.count}`}
                  </span>
                ))}
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">Posts (last 24h)</div>
              <PostsList posts={((dash as any)?.posts24h ?? dash.summary24h.evidencePosts) as any} emptyText="No posts found." />
            </div>
          </Card>

          {/* NEWS (StockTwits News tab only) */}
          <Card
            title={TITLES.news}
            collapsed={collapsed.news}
            onToggle={() => setCollapsed((c) => ({ ...c, news: !c.news }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  {topNews ? (
                    <>
                      <span className="newsMiniSource">{String(topNews.source ?? "stocktwits").toLowerCase()}</span>
                      <span className="newsMiniTitle">{topNews.title ?? topNews.url}</span>
                    </>
                  ) : (
                    <span className="muted">No news found.</span>
                  )}
                </div>
                {newsPublishedAt ? <div className="overviewStamp">published {timeAgo(newsPublishedAt)}</div> : null}
              </div>
            }
          >
            {/* Pass both shapes; NewsList will use whichever it supports */}
            <NewsList {...({ symbol, news: newsItems, links: newsLinks } as any)} />
          </Card>

          {/* POPULAR */}
          <Card
            title={TITLES.popular}
            collapsed={collapsed.popular}
            onToggle={() => setCollapsed((c) => ({ ...c, popular: !c.popular }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  {dash.preview.topPost ? (
                    <>
                      <span className="mono">@{dash.preview.topPost.user.username}</span>:{" "}
                      {dash.preview.topPost.body.slice(0, 160)}
                      {dash.preview.topPost.body.length > 160 ? "…" : ""}
                    </>
                  ) : (
                    <span className="muted">No popular posts.</span>
                  )}
                </div>
                {popularSentAt ? <div className="overviewStamp">sent {timeAgo(popularSentAt)}</div> : null}
              </div>
            }
          >
            <PostsList posts={dash.popularPosts24h as any} emptyText="No popular posts in last 24h." />
          </Card>

          {/* KEY USERS / HIGHLIGHTS */}
          <Card
            title={TITLES.highlights}
            collapsed={collapsed.highlights}
            onToggle={() => setCollapsed((c) => ({ ...c, highlights: !c.highlights }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  {dash.preview.topHighlight ? (
                    <>
                      <span className="mono">@{dash.preview.topHighlight.user.username}</span>:{" "}
                      {dash.preview.topHighlight.body.slice(0, 160)}
                      {dash.preview.topHighlight.body.length > 160 ? "…" : ""}
                    </>
                  ) : (
                    <span className="muted">No key-user posts.</span>
                  )}
                </div>
                {highlightsSentAt ? <div className="overviewStamp">sent {timeAgo(highlightsSentAt)}</div> : null}
              </div>
            }
          >
            <PostsList posts={dash.highlightedPosts as any} emptyText="No key-user posts found." />
          </Card>

          {/* CHARTS */}
          <div className="card full">
            <Card
              title={TITLES.charts}
              collapsed={collapsed.charts}
              onToggle={() => setCollapsed((c) => ({ ...c, charts: !c.charts }))}
              overview={<div className="muted">Daily series + price overlay (if configured).</div>}
            >
              <ChartPanel stats={stats} range={range} onRange={(r) => setRange(r)} />
            </Card>
          </div>
        </main>
      ) : null}

      <div className="bottomSafe" />
    </div>
  );
}
