import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardResponse, StatsResponse, SentLabel } from "../shared/types";
import Card from "./components/Card";
import TickerPicker from "./components/TickerPicker";
import PostsList from "./components/PostsList";
import NewsList from "./components/NewsList";
import ChartPanel from "./components/ChartPanel";
import { apiConfig, apiDashboard, apiStats, apiSync } from "./lib/api";
import { fmtInt, timeAgo } from "./lib/format";

type RangeKey = "1D" | "1W" | "1M";

function labelText(label: SentLabel): string {
  if (label === "bull") return "Bullish";
  if (label === "bear") return "Bearish";
  return "Neutral";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function sentimentIndex(score: number): number {
  // score [-1..1] => [0..100]
  return Math.round((clamp(score, -1, 1) + 1) * 50);
}

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Math.round(n * 1000) / 10;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}%`;
}

function deltaRow(label: string, value: number | null) {
  return (
    <div className="deltaRow" key={label}>
      <div className="deltaLabel">{label}</div>
      <div className="deltaValue">{pct(value)}</div>
    </div>
  );
}

const TITLES = {
  sentiment: "Sentiment",
  volume: "Message Volume",
  summary: "Summary",
  news: "News",
  popular: "Popular Posts",
  keyUsers: "Key Users",
  stats: "Advanced Stats"
};

export default function App() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [symbol, setSymbol] = useState<string>("RCAT");

  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [syncing, setSyncing] = useState<boolean>(false);

  // Card collapsed states (overview vs expanded is handled by Card component)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    sentiment: false,
    volume: false,
    summary: false,
    news: false,
    popular: false,
    keyUsers: false,
    stats: false
  });

  const lastLoadedAt = useRef<number>(0);

  const selectedTicker = useMemo(() => {
    const s = symbol.toUpperCase();
    return { symbol: s, displayName: dash?.displayName ?? s };
  }, [symbol, dash?.displayName]);

  const headerParts = useMemo(() => {
    const sym = (dash?.symbol ?? selectedTicker?.symbol ?? symbol ?? "—").toUpperCase();
    const name = dash?.displayName ?? selectedTicker?.displayName ?? "";
    return { sym, name };
  }, [dash?.displayName, dash?.symbol, selectedTicker?.displayName, selectedTicker?.symbol, symbol]);

  const lastSyncAt = dash?.lastSyncAt ?? null;
  const watchers = dash?.watchers ?? null;

  const topPostAt = dash?.preview?.topPost?.createdAt ?? null;
  const topPopAt = dash?.popularPosts24h?.[0]?.createdAt ?? null;
  const topHiAt = dash?.highlightedPosts?.[0]?.createdAt ?? null;
  const newsPublishedAt = dash?.news?.[0]?.publishedAt ?? null;

  const loadAll = useCallback(
    async (opts?: { includeStats?: boolean }) => {
      setErr(null);
      try {
        const d = await apiDashboard(symbol);
        setDash(d);

        if (opts?.includeStats) {
          const s = await apiStats(symbol);
          setStats(s);
        }

        lastLoadedAt.current = Date.now();
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    },
    [symbol]
  );

  const loadConfigOnce = useCallback(async () => {
    try {
      const cfg = await apiConfig();
      setTickers(cfg.tickers ?? []);
      // If current symbol isn't in config, default to first.
      if (cfg.tickers?.length) {
        const up = symbol.toUpperCase();
        if (!cfg.tickers.map((x) => x.toUpperCase()).includes(up)) {
          setSymbol(cfg.tickers[0].toUpperCase());
        }
      }
    } catch {
      // Non-fatal; fall back to hardcoded symbol
    }
  }, [symbol]);

  // initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadConfigOnce();
      if (!mounted) return;
      await loadAll({ includeStats: true });
    })();
    return () => {
      mounted = false;
    };
  }, [loadAll, loadConfigOnce]);

  // reload when symbol changes
  useEffect(() => {
    setLoading(true);
    setDash(null);
    setStats(null);
    (async () => {
      await loadAll({ includeStats: true });
    })();
  }, [symbol, loadAll]);

  // stale-on-focus refresh (avoid spamming)
  useEffect(() => {
    const STALE_MS = 8 * 60 * 1000;

    const maybeRefresh = async () => {
      const age = Date.now() - (lastLoadedAt.current || 0);
      if (age > STALE_MS) {
        await loadAll({ includeStats: true });
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    };

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadAll]);

  const refreshNow = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setErr(null);
    try {
      await apiSync(symbol);
      await loadAll({ includeStats: true });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSyncing(false);
    }
  }, [symbol, syncing, loadAll]);

  const sent = dash?.sentiment24h;
  const vol = dash?.volume24h;

  const sentIdx = sent ? sentimentIndex(sent.score) : null;
  const sentLabel = sent ? labelText(sent.label) : "—";

  const sentColorClass =
    sent?.label === "bull" ? "bull" : sent?.label === "bear" ? "bear" : "neutral";

  // Range rows (computed from daily stats series)
  const rangeDeltas = useMemo(() => {
    const out: Record<RangeKey, { vol: number | null; sent: number | null }> = {
      "1D": { vol: null, sent: null },
      "1W": { vol: null, sent: null },
      "1M": { vol: null, sent: null }
    };
    const series = stats?.series ?? [];
    if (series.length < 2) return out;

    const last = series[series.length - 1];

    const findByOffset = (days: number) => {
      const idx = series.length - 1 - days;
      return idx >= 0 ? series[idx] : null;
    };

    // 1D ~ previous day
    const d1 = findByOffset(1);
    if (d1) {
      out["1D"].vol = d1.volumeClean ? (last.volumeClean - d1.volumeClean) / d1.volumeClean : null;
      out["1D"].sent =
        d1.sentimentMean != null ? last.sentimentMean - d1.sentimentMean : null;
    }

    // 1W ~ 7 trading days-ish (use 7 points back in daily series)
    const w1 = findByOffset(7);
    if (w1) {
      out["1W"].vol = w1.volumeClean ? (last.volumeClean - w1.volumeClean) / w1.volumeClean : null;
      out["1W"].sent =
        w1.sentimentMean != null ? last.sentimentMean - w1.sentimentMean : null;
    }

    // 1M ~ 30 points back (calendar-ish)
    const m1 = findByOffset(30);
    if (m1) {
      out["1M"].vol = m1.volumeClean ? (last.volumeClean - m1.volumeClean) / m1.volumeClean : null;
      out["1M"].sent =
        m1.sentimentMean != null ? last.sentimentMean - m1.sentimentMean : null;
    }

    return out;
  }, [stats]);

  return (
    <div className="page">
      <header className="header">
        <div className="brandTitle">StockTwits Catalyst Dashboard</div>

        <div className="headerRow">
          <div className="brand">
            <div className="brandSub">
              <span className="brandSym">{headerParts.sym}</span>
              <span className="brandSep"> — </span>
              <span className="brandName">{headerParts.name || headerParts.sym}</span>
            </div>

            <div className="brandMeta">
              <span className="metaItem">
                Last sync:{" "}
                {lastSyncAt ? (
                  <span className="mono">{timeAgo(lastSyncAt)}</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span className="metaDot">•</span>
              <span className="metaItem">
                Watchers:{" "}
                {watchers != null ? (
                  <span className="mono">{fmtInt(watchers)}</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
            </div>
          </div>

          <div className="controls">
            <TickerPicker
              tickers={tickers.length ? tickers : ["RCAT", "UMAC", "GRRR", "ACHR", "FIG"]}
              value={symbol}
              onChange={(s) => setSymbol(s)}
            />

            <button
              className="btn"
              onClick={refreshNow}
              disabled={syncing}
              aria-busy={syncing}
              title="Sync + refresh"
            >
              {syncing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {err ? <div className="errorBox">{err}</div> : null}
      </header>

      <main className="grid">
        <Card
          title={TITLES.sentiment}
          collapsed={collapsed.sentiment}
          onToggle={() => setCollapsed((c) => ({ ...c, sentiment: !c.sentiment }))}
          overview={
            <div className="overviewStack">
              <div className="overviewMain">
                <span className={`sentLabel ${sentColorClass}`}>{sentLabel}</span>
                {sentIdx != null ? (
                  <span className="sentIndex">{sentIdx}</span>
                ) : (
                  <span className="muted">—</span>
                )}
                <span className="muted">/100</span>
              </div>
              <div className="overviewStamp">vs prev day: {pct(sent?.vsPrevDay ?? null)}</div>
            </div>
          }
        >
          <div className="expanded">
            <div className="deltaGrid">
              {deltaRow("1D", rangeDeltas["1D"].sent)}
              {deltaRow("1W", rangeDeltas["1W"].sent)}
              {deltaRow("1M", rangeDeltas["1M"].sent)}
            </div>

            <div className="muted small">
              Sample size: <span className="mono">{fmtInt(sent?.sampleSize ?? 0)}</span>
            </div>
          </div>
        </Card>

        <Card
          title={TITLES.volume}
          collapsed={collapsed.volume}
          onToggle={() => setCollapsed((c) => ({ ...c, volume: !c.volume }))}
          overview={
            <div className="overviewStack">
              <div className="overviewMain">
                <span className="bigNum">{fmtInt(vol?.clean ?? 0)}</span>
                <span className="muted">clean /</span>
                <span className="muted">{fmtInt(vol?.total ?? 0)} total</span>
              </div>
              <div className="overviewStamp">vs prev day: {pct(vol?.vsPrevDay ?? null)}</div>
            </div>
          }
        >
          <div className="expanded">
            <div className="deltaGrid">
              {deltaRow("1D", rangeDeltas["1D"].vol)}
              {deltaRow("1W", rangeDeltas["1W"].vol)}
              {deltaRow("1M", rangeDeltas["1M"].vol)}
            </div>
          </div>
        </Card>

        <Card
          title={TITLES.summary}
          collapsed={collapsed.summary}
          onToggle={() => setCollapsed((c) => ({ ...c, summary: !c.summary }))}
          overview={
            <div className="overviewStack">
              <div className="overviewMain">
                {dash?.summary24h?.tldr ? (
                  <span className="summaryMini">{dash.summary24h.tldr}</span>
                ) : (
                  <span className="muted">No summary yet.</span>
                )}
              </div>
              {topPostAt ? <div className="overviewStamp">latest post {timeAgo(topPostAt)}</div> : null}
            </div>
          }
        >
          <div className="expanded">
            {dash?.summary24h?.tldr ? (
              <div className="summaryBlock">{dash.summary24h.tldr}</div>
            ) : (
              <div className="muted">No summary found.</div>
            )}

            {dash?.summary24h?.themes?.length ? (
              <div className="themes">
                {dash.summary24h.themes.map((t) => (
                  <span key={t} className="pill">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            {dash?.summary24h?.keyLinks?.length ? (
              <div className="keyLinks">
                <div className="sectionTitle">Most shared link</div>
                <a
                  className="linkRow"
                  href={dash.summary24h.keyLinks[0].url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="linkDomain">{dash.summary24h.keyLinks[0].domain}</span>
                  <span className="linkTitle">
                    {dash.summary24h.keyLinks[0].title ?? dash.summary24h.keyLinks[0].url}
                  </span>
                  <span className="linkMeta">
                    {fmtInt(dash.summary24h.keyLinks[0].count)}× • shared{" "}
                    {timeAgo(dash.summary24h.keyLinks[0].lastSharedAt)}
                  </span>
                </a>
              </div>
            ) : null}

            <div className="sectionTitle">Posts (last 24h)</div>
            <PostsList posts={dash?.posts24h ?? []} />
          </div>
        </Card>

        <Card
          title={TITLES.news}
          collapsed={collapsed.news}
          onToggle={() => setCollapsed((c) => ({ ...c, news: !c.news }))}
          overview={
            <div className="overviewStack">
              <div className="overviewMain">
                {dash.news?.[0] ? (
                  <>
                    <span className="newsMiniSource">
                      {(dash.news[0].source ?? "stocktwits").toLowerCase()}
                    </span>
                    <span className="newsMiniTitle">{dash.news[0].title}</span>
                  </>
                ) : (
                  <span className="muted">No news found.</span>
                )}
              </div>
              {newsPublishedAt ? (
                <div className="overviewStamp">published {timeAgo(newsPublishedAt)}</div>
              ) : null}
            </div>
          }
        >
          <NewsList symbol={symbol} news={dash.news} />
        </Card>

        <Card
          title={TITLES.popular}
          collapsed={collapsed.popular}
          onToggle={() => setCollapsed((c) => ({ ...c, popular: !c.popular }))}
          overview={
            <div className="overviewStack">
              <div className="overviewMain">
                {dash?.popularPosts24h?.[0] ? (
                  <span className="summaryMini">{dash.popularPosts24h[0].body}</span>
                ) : (
                  <span className="muted">No posts found.</span>
                )}
              </div>
              {topPopAt ? <div className="overviewStamp">top post {timeAgo(topPopAt)}</div> : null}
            </div>
          }
        >
          <PostsList posts={dash?.popularPosts24h ?? []} />
        </Card>

        <Card
          title={TITLES.keyUsers}
          collapsed={collapsed.keyUsers}
          onToggle={() => setCollapsed((c) => ({ ...c, keyUsers: !c.keyUsers }))}
          overview={
            <div className="overviewStack">
              <div className="overviewMain">
                {dash?.highlightedPosts?.[0] ? (
                  <span className="summaryMini">{dash.highlightedPosts[0].body}</span>
                ) : (
                  <span className="muted">No highlighted posts.</span>
                )}
              </div>
              {topHiAt ? <div className="overviewStamp">latest {timeAgo(topHiAt)}</div> : null}
            </div>
          }
        >
          <PostsList posts={dash?.highlightedPosts ?? []} />
        </Card>

        <Card
          title={TITLES.stats}
          collapsed={collapsed.stats}
          onToggle={() => setCollapsed((c) => ({ ...c, stats: !c.stats }))}
          overview={
            <div className="overviewStack">
              <div className="overviewMain">
                <span className="muted">
                  {stats?.series?.length ? `${fmtInt(stats.series.length)} points` : "No series yet."}
                </span>
              </div>
            </div>
          }
        >
          <ChartPanel stats={stats} />
        </Card>
      </main>

      <footer className="footer">
        {loading ? <span className="muted">Loading…</span> : null}
      </footer>
    </div>
  );
}
