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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Map [-1..+1] to [0..100] where 50 is neutral.
function sentimentToIndex(score: number) {
  const s = Number.isFinite(score) ? score : 0;
  return clamp(Math.round((s + 1) * 50), 0, 100);
}

function pctChange(curr: number, prev: number | null) {
  if (prev === null) return null;
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export default function App() {
  const [tickers, setTickers] = useState<TickerOpt[]>([]);
  const [symbol, setSymbol] = useState<string>(""); // start empty
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [range, setRange] = useState<30 | 90 | 365>(90);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Record<CardKey, boolean>>({
    sentiment: true,
    volume: true,
    summary: true,
    news: true,
    popular: true,
    highlights: true,
    charts: true
  });

  const lastSuccessfulLoadRef = useRef<number>(0);

  const selectedTicker = useMemo(() => {
    const s = symbol?.toUpperCase();
    return tickers.find((t) => t.symbol.toUpperCase() === s) ?? null;
  }, [tickers, symbol]);

  async function loadAll(sym: string, opts?: { includeStats?: boolean }) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const d = await apiDashboard(sym);
      setDash(d);

      if (opts?.includeStats) {
        const s = await apiStats(sym, range);
        setStats(s);
      }

      lastSuccessfulLoadRef.current = Date.now();
    } catch (e: any) {
      setDash(null);
      setStats(null);
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshNow() {
    if (!symbol) return;
    setSyncing(true);
    setErrorMsg(null);
    try {
      await apiSync(symbol);
      await loadAll(symbol, { includeStats: true });
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setSyncing(false);
    }
  }

  // Load config once, then set initial symbol from config.
  useEffect(() => {
    (async () => {
      const cfg = await apiConfig();
      const opts: TickerOpt[] = (cfg.tickers ?? []).map((t: any) => ({
        symbol: t.symbol,
        displayName: t.displayName,
        logoUrl: t.logoUrl
      }));
      setTickers(opts);

      if (!opts.length) {
        setErrorMsg("No tickers returned by /api/config");
        return;
      }

      setSymbol((prev) => (prev && opts.some((o) => o.symbol === prev) ? prev : opts[0].symbol));
    })().catch((e) => setErrorMsg(String(e?.message ?? e)));
  }, []);

  // Load whenever symbol or range changes.
  useEffect(() => {
    if (!symbol) return;
    loadAll(symbol, { includeStats: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range]);

  // Auto-refresh only after at least one successful load, and only when stale.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!symbol) return;
      if (lastSuccessfulLoadRef.current === 0) return;

      const age = Date.now() - lastSuccessfulLoadRef.current;
      if (age > 8 * 60 * 1000) {
        refreshNow().catch(() => {});
      }
    };

    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const headerLine = useMemo(() => {
    if (!dash) return selectedTicker ? `${selectedTicker.symbol} — ${selectedTicker.displayName}` : symbol || "—";
    return `${dash.symbol} — ${dash.displayName}`;
  }, [dash, selectedTicker, symbol]);

  // Sentiment display (0..100)
  const sentimentIndex = dash ? sentimentToIndex(dash.sentiment24h.score) : 50;
  const prevIndex =
    dash && dash.sentiment24h.vsPrevDay != null
      ? sentimentToIndex(dash.sentiment24h.score - dash.sentiment24h.vsPrevDay)
      : null;
  const sentimentPct = dash ? pctChange(sentimentIndex, prevIndex) : null;

  const topLink = dash?.summary24h?.keyLinks?.[0] ?? null;
  const topThemes = dash?.summary24h?.themes?.slice(0, 3) ?? [];

  return (
    <div className="app">
      <div className="topSafe" />

      <header className="header">
        <div className="brand">
          {/* 1) Title largest */}
          <div className="brandTitle">StockTwits Dashboard</div>

          {/* 2) Symbol/name next */}
          <div className="brandSubRow">
            {selectedTicker?.logoUrl ? (
              <img
                className="brandLogo"
                src={selectedTicker.logoUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <div className="brandSub">{headerLine}</div>
          </div>

          {/* 3) Then last sync/watchers */}
          <div className="brandMeta">
            <span>Last sync: {dash?.lastSyncAt ? timeAgo(dash.lastSyncAt) : "—"}</span>
            <span className="dot">•</span>
            <span>Watchers: {dash?.watchers != null ? fmtInt(dash.watchers) : "—"}</span>
          </div>
        </div>

        <div className="controls">
          {/* 4) "Ticker" label same line */}
          <TickerPicker value={symbol} options={tickers} onChange={setSymbol} />

          {/* 5) Smaller, non-neon refresh */}
          <button className="refreshBtn" onClick={refreshNow} disabled={syncing || !symbol}>
            {syncing ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </header>

      {errorMsg ? (
        <div className="errorBanner">
          <div className="errorTitle">API Error</div>
          <div className="errorBody">{errorMsg}</div>
        </div>
      ) : null}

      {loading && !dash ? <div className="muted pad">Loading…</div> : null}

      {dash ? (
        <main className="grid">
          {/* SENTIMENT */}
          <Card
            title="Sentiment"
            collapsed={collapsed.sentiment}
            onToggle={() => setCollapsed((c) => ({ ...c, sentiment: !c.sentiment }))}
            overview={
              <div className="sentOverview">
                {/* 6) label left, same size */}
                <div className={"sentLabel " + dash.sentiment24h.label}>{dash.sentiment24h.label}</div>
                <div className="sentNumber">{sentimentIndex}</div>
                <div className="sentDelta">
                  {sentimentPct == null ? "—" : `${sentimentPct >= 0 ? "+" : ""}${sentimentPct.toFixed(1)}%`}
                </div>
              </div>
            }
          >
            <div className="muted">
              This is a 0–100 index: 0 = most bearish, 50 = neutral, 100 = most bullish.
            </div>
            <div className="muted">
              For deeper history, use the Advanced Stats sentiment chart (daily aggregation).
            </div>
          </Card>

          {/* VOLUME */}
          <Card
            title="Message Volume"
            collapsed={collapsed.volume}
            onToggle={() => setCollapsed((c) => ({ ...c, volume: !c.volume }))}
            overview={
              <div className="statRow">
                <div className="statBig">{fmtInt(dash.volume24h.clean)}</div>
                <div className="statSmall">
                  total {fmtInt(dash.volume24h.total)}
                  {dash.volume24h.buzzMultiple != null ? ` • ${dash.volume24h.buzzMultiple}× buzz` : ""}
                </div>
              </div>
            }
          >
            <div className="muted">
              Buzz multiple = 24h clean volume / average clean daily volume over the last ~20 stored days.
            </div>
          </Card>

          {/* SUMMARY */}
          <Card
            title="Daily Summary"
            collapsed={collapsed.summary}
            onToggle={() => setCollapsed((c) => ({ ...c, summary: !c.summary }))}
            overview={
              <div className="summaryOverview">
                <p>
                  <span className="summaryLabel">Retail tone:</span>{" "}
                  <span className={"pill inline " + dash.sentiment24h.label}>{dash.sentiment24h.label}</span>{" "}
                  <span className="muted">({sentimentIndex}/100)</span>
                </p>

                <p>
                  <span className="summaryLabel">Top themes:</span>{" "}
                  {topThemes.length ? (
                    <span>
                      {topThemes.map((t) => `${t.name} (${t.count})`).join(" • ")}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </p>

                <p>
                  <span className="summaryLabel">Most shared link:</span>{" "}
                  {topLink ? (
                    <a className="link" href={topLink.url} target="_blank" rel="noreferrer">
                      {topLink.domain} — {topLink.title ?? topLink.url}
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </p>
              </div>
            }
          >
            <div className="section">
              <div className="sectionTitle">TL;DR</div>
              <div className="tldr">{dash.summary24h.tldr}</div>
            </div>

            <div className="section">
              <div className="sectionTitle">Themes</div>
              <div className="chips">
                {dash.summary24h.themes.map((t) => (
                  <span key={t.name} className="chip">
                    {t.name} · {t.count}
                  </span>
                ))}
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">Evidence Posts</div>
              <PostsList posts={dash.summary24h.evidencePosts as any} emptyText="No evidence posts." />
            </div>
          </Card>

          {/* NEWS */}
          <Card
            title="News"
            collapsed={collapsed.news}
            onToggle={() => setCollapsed((c) => ({ ...c, news: !c.news }))}
            overview={
              topLink ? (
                <div className="newsOverview">
                  <div className="newsDomain">{topLink.domain}</div>
                  <div className="newsTitle">{topLink.title ?? topLink.url}</div>
                </div>
              ) : (
                <div className="muted">No links found.</div>
              )
            }
          >
            <NewsList links={dash.summary24h.keyLinks} />
          </Card>

          {/* POPULAR */}
          <Card
            title="Popular Posts"
            collapsed={collapsed.popular}
            onToggle={() => setCollapsed((c) => ({ ...c, popular: !c.popular }))}
            overview={
              dash.preview.topPost ? (
                <div>
                  <span className="mono">@{dash.preview.topPost.user.username}</span>:{" "}
                  {dash.preview.topPost.body.slice(0, 160)}
                  {dash.preview.topPost.body.length > 160 ? "…" : ""}
                </div>
              ) : (
                <div className="muted">No popular post.</div>
              )
            }
          >
            <PostsList posts={dash.popularPosts24h as any} emptyText="No popular posts in last 24h." />
          </Card>

          {/* HIGHLIGHTS */}
          <Card
            title="Key Users"
            collapsed={collapsed.highlights}
            onToggle={() => setCollapsed((c) => ({ ...c, highlights: !c.highlights }))}
            overview={
              dash.preview.topHighlight ? (
                <div>
                  <span className="mono">@{dash.preview.topHighlight.user.username}</span>:{" "}
                  {dash.preview.topHighlight.body.slice(0, 160)}
                  {dash.preview.topHighlight.body.length > 160 ? "…" : ""}
                </div>
              ) : (
                <div className="muted">No highlighted posts.</div>
              )
            }
          >
            <PostsList posts={dash.highlightedPosts as any} emptyText="No highlighted posts found." />
          </Card>

          {/* CHARTS */}
          <div className="card full">
            <Card
              title="Advanced Stats"
              subtitle="Daily series + price overlay (if FINNHUB_API_KEY set)"
              collapsed={collapsed.charts}
              onToggle={() => setCollapsed((c) => ({ ...c, charts: !c.charts }))}
              overview={<div className="muted">Limited charts to keep iOS PWA fast.</div>}
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
