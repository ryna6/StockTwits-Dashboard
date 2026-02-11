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

type Change = {
  from: number;
  to: number;
  diff: number;
  pct: number | null;
};

function computeChange(series: number[], stepsBack: number, toOverride?: number): Change | null {
  if (!series.length && toOverride == null) return null;
  const to = toOverride ?? series[series.length - 1];
  const i = series.length - 1 - stepsBack;
  if (i < 0) return null;
  const rawFrom = series[i];

  const to = Math.round(rawTo);
  const from = Math.round(rawFrom);
  const diff = Math.round(to - from);
  const pct = from < 1 ? null : (diff / from) * 100;

  return { from, to, diff, pct };
}

function deltaClass(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "delta neutral";
  const abs = Math.abs(pct);
  const strong = abs >= 10 ? " strong" : "";
  if (pct > 0) return "delta up" + strong;
  if (pct < 0) return "delta down" + strong;
  return "delta neutral";
}

function fmtPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function lastNonNull<T>(arr: T[], pick: (x: any) => number | null | undefined) {
  const out: number[] = [];
  for (const p of arr) {
    const v = pick(p);
    if (v == null) continue;
    if (!Number.isFinite(Number(v))) continue;
    out.push(Number(v));
  }
  return out;
}

export default function App() {
  const [tickers, setTickers] = useState<TickerOpt[]>([]);
  const [symbol, setSymbol] = useState<string>("");

  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const range = 90 as const;

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

  async function refreshNow(opts?: { hardReload?: boolean }) {
    if (!symbol) return;
    setSyncing(true);
    setErrorMsg(null);
    try {
      await apiSync(symbol);
      if (opts?.hardReload) {
        window.location.reload();
        return;
      }
      await loadAll(symbol, { includeStats: true });
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setSyncing(false);
    }
  }

  // Load config once and pick default ticker
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

  // Reload whenever symbol/range changes
  useEffect(() => {
    if (!symbol) return;
    loadAll(symbol, { includeStats: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range]);

  // Auto-refresh only when stale, only after successful load
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!symbol) return;
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
  }, [symbol]);

  const companyName = useMemo(() => {
    if (dash?.displayName) return dash.displayName;
    return selectedTicker?.displayName ?? symbol ?? "—";
  }, [dash, selectedTicker, symbol]);

  const topThemesText = useMemo(() => {
    const items = dash?.summary24h?.themes ?? [];
    if (!items.length) return "—";
    return items
      .slice(0, 3)
      .map((t) => t.name)
      .filter(Boolean)
      .join(", ");
  }, [dash]);

  // ---- derive daily series deltas from stats (preferred baseline) ----
  const points = stats?.points ?? [];

  // sentiment daily series (0..100 index)
  const sentDailyIdx = useMemo(() => lastNonNull(points as any[], (p: any) => p.sentimentMean), [points]);

  const sentNowIdx = dash ? Math.round(dash.sentiment24h.score) : sentDailyIdx.length ? Math.round(sentDailyIdx[sentDailyIdx.length - 1]) : 50;

  const sent1d = useMemo(() => computeChange(sentDailyIdx, 1, sentNowIdx), [sentDailyIdx, sentNowIdx]);
  const sent1w = useMemo(() => computeChange(sentDailyIdx, 5, sentNowIdx), [sentDailyIdx, sentNowIdx]);
  const sent1m = useMemo(() => computeChange(sentDailyIdx, 21, sentNowIdx), [sentDailyIdx, sentNowIdx]);

  // volume daily series (clean)
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
  const topNews = dash?.news24h?.[0] ?? null;
  const newsSharedAt = topNews?.datetime ? new Date(topNews.datetime * 1000).toISOString() : null;

  return (
    <div className="app">
      <div className="topSafe" />

      {/* ✅ Force title row + content row layout here */}
      <header
        className="header"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch"
        }}
      >
        <div className="brandTitle">StockTwits Dashboard</div>

        <div
          className="headerRow"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 14,
            flexWrap: "wrap"
          }}
        >
          {/* LEFT: logo + symbol/name + last sync/watchers */}
          <div className="brand" style={{ minWidth: 260 }}>
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
              <div className="brandSub">{companyName}</div>
            </div>

            <div className="brandMeta">
              <span>Last sync: {dash?.lastSyncAt ? timeAgo(dash.lastSyncAt) : "—"}</span>
              <span className="dot">•</span>
              <span>
                  Watchers: {dash?.watchers != null ? fmtInt(dash.watchers) : "—"}
                  {dash?.watchers != null && dash?.watchersDelta != null ? (
                    <span className={"watchDelta " + (dash.watchersDelta > 0 ? "up" : dash.watchersDelta < 0 ? "down" : "flat")}>
                      {" "}
                      ({dash.watchersDelta > 0 ? "+" : ""}
                      {fmtInt(dash.watchersDelta)}
                      )
                    </span>
                  ) : null}
                </span>
            </div>
          </div>

          {/* RIGHT: dropdown + refresh */}
          <div
            className="controls"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
              marginLeft: "auto"
            }}
          >
            <TickerPicker value={symbol} options={tickers} onChange={setSymbol} compact />
            <button className="refreshBtn" onClick={() => { void refreshNow(); }} disabled={syncing || !symbol}>
              {syncing ? "Syncing…" : "Refresh"}
            </button>
          </div>
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
            title={TITLES.sentiment}
            collapsed={collapsed.sentiment}
            onToggle={() => setCollapsed((c) => ({ ...c, sentiment: !c.sentiment }))}
            overview={
              <div className="sentOverview">
                <div className={"sentLabel " + dash.sentiment24h.label}>{toneText}</div>
                <div className="sentNumber">{sentNowIdx}</div>
                <div className={deltaClass(sent1d?.pct ?? null)}>{fmtPct(sent1d?.pct ?? null)}</div>
              </div>
            }
          >
            <div className="deltaGrid">
              <div className="deltaRow">
                <div className="deltaTf">1D</div>
                <div className="deltaVal">{sent1d ? `${sent1d.to} (${sent1d.diff >= 0 ? "+" : ""}${sent1d.diff})` : "—"}</div>
                <div className={deltaClass(sent1d?.pct ?? null)}>{fmtPct(sent1d?.pct ?? null)}</div>
              </div>

              <div className="deltaRow">
                <div className="deltaTf">1W</div>
                <div className="deltaVal">{sent1w ? `${sent1w.to} (${sent1w.diff >= 0 ? "+" : ""}${sent1w.diff})` : "—"}</div>
                <div className={deltaClass(sent1w?.pct ?? null)}>{fmtPct(sent1w?.pct ?? null)}</div>
              </div>

              <div className="deltaRow">
                <div className="deltaTf">1M</div>
                <div className="deltaVal">{sent1m ? `${sent1m.to} (${sent1m.diff >= 0 ? "+" : ""}${sent1m.diff})` : "—"}</div>
                <div className={deltaClass(sent1m?.pct ?? null)}>{fmtPct(sent1m?.pct ?? null)}</div>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Sentiment is shown as a 0–100 index (0 bearish, 50 neutral, 100 bullish), computed from daily aggregates.
            </div>
          </Card>

          {/* MESSAGE VOLUME */}
          <Card
            title={TITLES.volume}
            collapsed={collapsed.volume}
            onToggle={() => setCollapsed((c) => ({ ...c, volume: !c.volume }))}
            overview={
              <div className="statRow">
                <div className="statBig">{fmtInt(volNow)}</div>
                <div className={deltaClass(vol1d?.pct ?? null)}>{fmtPct(vol1d?.pct ?? null)}</div>
              </div>
            }
          >
            <div className="deltaGrid">
              <div className="deltaRow">
                <div className="deltaTf">1D</div>
                <div className="deltaVal">
                  {vol1d ? `${fmtInt(vol1d.to)} (${vol1d.diff >= 0 ? "+" : ""}${fmtInt(vol1d.diff)})` : "—"}
                </div>
                <div className={deltaClass(vol1d?.pct ?? null)}>{fmtPct(vol1d?.pct ?? null)}</div>
              </div>

              <div className="deltaRow">
                <div className="deltaTf">1W</div>
                <div className="deltaVal">
                  {vol1w ? `${fmtInt(vol1w.to)} (${vol1w.diff >= 0 ? "+" : ""}${fmtInt(vol1w.diff)})` : "—"}
                </div>
                <div className={deltaClass(vol1w?.pct ?? null)}>{fmtPct(vol1w?.pct ?? null)}</div>
              </div>

              <div className="deltaRow">
                <div className="deltaTf">1M</div>
                <div className="deltaVal">
                  {vol1m ? `${fmtInt(vol1m.to)} (${vol1m.diff >= 0 ? "+" : ""}${fmtInt(vol1m.diff)})` : "—"}
                </div>
                <div className={deltaClass(vol1m?.pct ?? null)}>{fmtPct(vol1m?.pct ?? null)}</div>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Volume changes are based on stored daily clean message counts (best baseline for % change).
            </div>
          </Card>

          {/* SUMMARY */}
          <Card
            title={TITLES.summary}
            collapsed={collapsed.summary}
            onToggle={() => setCollapsed((c) => ({ ...c, summary: !c.summary }))}
            overview={
              <div className="overviewStack">
                <div className="summaryOverview">
                  <p>{dash.summary24h?.longSummary ?? "No summary available yet."}</p>
                  <p>
                    <span className="summaryLabel">Top themes:</span> {topThemesText}
                  </p>
                </div>
                {summarySentAt ? <div className="overviewStamp">sent {timeAgo(summarySentAt)}</div> : null}
              </div>
            }
          >

            <div className="section">
              <div className="sectionTitle">Summary (last 24h)</div>
              <div className="tldr">{dash.summary24h?.longSummary ?? "No summary available yet. Press Refresh to sync."}</div>
            </div>

            <div className="section">
              <div className="sectionTitle">Top themes</div>
              <div className="chips">
                {(dash.summary24h?.themes ?? []).map((t) => (
                  <span key={t.name} className="chip">
                    {t.name} · {t.count}
                  </span>
                ))}
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">Posts (last 24h)</div>
              <PostsList posts={(((dash as any)?.posts24h ?? dash.summary24h?.evidencePosts ?? []) as any[])} emptyText="No posts found." sentimentMode="tagOnly" />
            </div>
          </Card>

          {/* NEWS */}
          <Card
            title={TITLES.news}
            collapsed={collapsed.news}
            onToggle={() => setCollapsed((c) => ({ ...c, news: !c.news }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  {topNews ? (
                    <div className="newsMiniItem">
                      <span className="newsMiniTitle">{topNews.headline}</span>
                      <span className="newsMiniSummary">{topNews.summary}</span>
                      <a className="newsMiniLink" href={topNews.url} target="_blank" rel="noreferrer">
                        {topNews.url}
                      </a>
                      <span className="newsMiniSource">{topNews.source}</span>
                    </div>
                  ) : (
                    <span className="muted">No news in the past 24h.</span>
                  )}
                </div>
                {newsSharedAt ? <div className="overviewStamp">posted {timeAgo(newsSharedAt)}</div> : null}
              </div>
            }
          >
            <NewsList links={dash.news24h ?? []} />
          </Card>

          {/* POPULAR */}
          <Card
            title={TITLES.popular}
            collapsed={collapsed.popular}
            onToggle={() => setCollapsed((c) => ({ ...c, popular: !c.popular }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  {dash.preview?.topPost ? (
                    <>
                      <span className="mono">@{dash.preview?.topPost?.user?.username ?? "unknown"}</span>:{" "}
                      {(dash.preview?.topPost?.body ?? "").slice(0, 160)}
                      {(dash.preview?.topPost?.body ?? "").length > 160 ? "…" : ""}
                    </>
                  ) : (
                    <span className="muted">No popular posts.</span>
                  )}
                </div>
                {popularSentAt ? <div className="overviewStamp">sent {timeAgo(popularSentAt)}</div> : null}
              </div>
            }
          >
            <PostsList posts={(dash.popularPosts24h ?? []) as any} emptyText="No popular posts in last 24h." sentimentMode="tagOnly" />
          </Card>

          {/* KEY USERS / HIGHLIGHTS */}
          <Card
            title={TITLES.highlights}
            collapsed={collapsed.highlights}
            onToggle={() => setCollapsed((c) => ({ ...c, highlights: !c.highlights }))}
            overview={
              <div className="overviewStack">
                <div className="overviewMain">
                  {dash.preview?.topHighlight ? (
                    <>
                      <span className="mono">@{dash.preview?.topHighlight?.user?.username ?? "unknown"}</span>:{" "}
                      {(dash.preview?.topHighlight?.body ?? "").slice(0, 160)}
                      {(dash.preview?.topHighlight?.body ?? "").length > 160 ? "…" : ""}
                    </>
                  ) : (
                    <span className="muted">No key-user posts.</span>
                  )}
                </div>
                {highlightsSentAt ? <div className="overviewStamp">sent {timeAgo(highlightsSentAt)}</div> : null}
              </div>
            }
          >
            <PostsList posts={(dash.highlightedPosts ?? []) as any} emptyText="No key-user posts found." />
          </Card>

          {/* CHARTS */}
          <div className="card full">
            <Card
              title={TITLES.charts}
              collapsed={collapsed.charts}
              onToggle={() => setCollapsed((c) => ({ ...c, charts: !c.charts }))}
              overview={<div className="muted">Daily series + price overlay (if configured).</div>}
            >
              <ChartPanel stats={stats} />
            </Card>
          </div>
        </main>
      ) : null}

      <div className="bottomSafe" />
    </div>
  );
}
