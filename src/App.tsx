import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardResponse, StatsResponse } from "../shared/types";
import { apiConfig, apiDashboard, apiStats, apiSync } from "./lib/api";
import { fmtInt, fmtScore, timeAgo } from "./lib/format";
import Card from "./components/Card";
import PostsList from "./components/PostsList";
import NewsList from "./components/NewsList";
import TickerPicker from "./components/TickerPicker";
import ChartPanel from "./components/ChartPanel";

type CardKey = "sentiment" | "volume" | "summary" | "news" | "popular" | "highlights" | "charts";

export default function App() {
  const [tickers, setTickers] = useState<{ symbol: string; displayName: string }[]>([]);
  const [symbol, setSymbol] = useState<string>(""); // start empty to avoid invalid early calls
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [range, setRange] = useState<30 | 90 | 365>(90);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Record<CardKey, boolean>>({
    sentiment: true,
    volume: true,
    summary: false,
    news: true,
    popular: true,
    highlights: true,
    charts: true
  });

  const lastSuccessfulLoadRef = useRef<number>(0);

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

  // 1) Load config once. Pick first ticker from config.
  useEffect(() => {
    (async () => {
      const cfg = await apiConfig();
      const opts = (cfg.tickers ?? []).map((t: any) => ({
        symbol: t.symbol,
        displayName: t.displayName
      }));
      setTickers(opts);

      if (!opts.length) {
        setErrorMsg("No tickers returned by /api/config");
        return;
      }

      // Keep current symbol if valid; otherwise default to first.
      setSymbol((prev) => (prev && opts.some((o) => o.symbol === prev) ? prev : opts[0].symbol));
    })().catch((e) => setErrorMsg(String(e?.message ?? e)));
  }, []);

  // 2) Load dashboard + stats whenever symbol or range changes.
  useEffect(() => {
    if (!symbol) return;
    loadAll(symbol, { includeStats: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range]);

  // 3) Auto-refresh only if we previously loaded successfully, and only when stale.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!symbol) return;
      if (lastSuccessfulLoadRef.current === 0) return; // avoid spamming if we've never loaded successfully

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

  const header = useMemo(() => {
    return dash ? `${dash.symbol} — ${dash.displayName}` : symbol ? `${symbol}` : "—";
  }, [dash, symbol]);

  return (
    <div className="app">
      <div className="topSafe" />

      <header className="header">
        <div className="brand">
          <div className="brandTitle">StockTwits Dashboard</div>
          <div className="brandSub">{header}</div>
          <div className="brandMeta">
            <span>Last sync: {dash?.lastSyncAt ? timeAgo(dash.lastSyncAt) : "—"}</span>
            <span className="dot">•</span>
            <span>Watchers: {dash?.watchers != null ? fmtInt(dash.watchers) : "—"}</span>
          </div>
        </div>

        <div className="controls">
          <TickerPicker value={symbol} options={tickers} onChange={setSymbol} />
          <button className="primaryBtn" onClick={refreshNow} disabled={syncing || !symbol}>
            {syncing ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </header>

      {errorMsg ? (
        <div
          style={{
            border: "1px solid rgba(255,92,92,.35)",
            background: "rgba(255,92,92,.08)",
            padding: "10px 12px",
            borderRadius: 12,
            marginBottom: 12,
            color: "var(--text)"
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>API Error</div>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
              opacity: 0.9
            }}
          >
            {errorMsg}
          </div>
        </div>
      ) : null}

      {loading && !dash ? <div className="muted pad">Loading…</div> : null}

      {dash ? (
        <main className="grid">
          <Card
            title="Headline Sentiment (24h)"
            subtitle="Rule-based model sentiment (spam-filtered)"
            collapsed={collapsed.sentiment}
            onToggle={() => setCollapsed((c) => ({ ...c, sentiment: !c.sentiment }))}
            right={<span className={"pill " + dash.sentiment24h.label}>{dash.sentiment24h.label}</span>}
            overview={
              <div className="statRow">
                <div className="statBig">{fmtScore(dash.sentiment24h.score)}</div>
                <div className="statSmall">
                  sample: {fmtInt(dash.sentiment24h.sampleSize)}
                  {dash.sentiment24h.vsPrevDay != null ? ` • vs prev: ${fmtScore(dash.sentiment24h.vsPrevDay)}` : ""}
                </div>
              </div>
            }
          >
            <div className="muted">
              Expanded sentiment deltas can be computed from the daily series in Advanced Stats (kept centralized).
            </div>
          </Card>

          <Card
            title="Message Volume (24h)"
            subtitle="clean vs total + buzz multiple"
            collapsed={collapsed.volume}
            onToggle={() => setCollapsed((c) => ({ ...c, volume: !c.volume }))}
            right={
              dash.volume24h.buzzMultiple != null ? <span className="pill">{dash.volume24h.buzzMultiple}× buzz</span> : null
            }
            overview={
              <div className="statRow">
                <div className="statBig">{fmtInt(dash.volume24h.clean)}</div>
                <div className="statSmall">total: {fmtInt(dash.volume24h.total)}</div>
              </div>
            }
          >
            <div className="muted">
              Buzz multiple = 24h clean volume / average clean daily volume over the last ~20 stored days.
            </div>
          </Card>

          <Card
            title="Summary of Posts (24h)"
            subtitle="Narrative + themes + evidence"
            collapsed={collapsed.summary}
            onToggle={() => setCollapsed((c) => ({ ...c, summary: !c.summary }))}
            overview={<div>{dash.summary24h.tldr}</div>}
          >
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

          <Card
            title="News / Links"
            subtitle="Extracted from messages (grouped by URL)"
            collapsed={collapsed.news}
            onToggle={() => setCollapsed((c) => ({ ...c, news: !c.news }))}
            overview={
              dash.summary24h.keyLinks?.[0] ? (
                <div>
                  {dash.summary24h.keyLinks[0].domain} — {dash.summary24h.keyLinks[0].title ?? dash.summary24h.keyLinks[0].url}
                </div>
              ) : (
                <div className="muted">No key links.</div>
              )
            }
          >
            <NewsList links={dash.summary24h.keyLinks} />
          </Card>

          <Card
            title="Popular Posts (24h)"
            subtitle="likes + 2×replies + small follower weight"
            collapsed={collapsed.popular}
            onToggle={() => setCollapsed((c) => ({ ...c, popular: !c.popular }))}
            overview={
              dash.preview.topPost ? (
                <div>
                  <span className="mono">@{dash.preview.topPost.user.username}</span>: {dash.preview.topPost.body.slice(0, 140)}
                  {dash.preview.topPost.body.length > 140 ? "…" : ""}
                </div>
              ) : (
                <div className="muted">No popular post.</div>
              )
            }
          >
            <PostsList posts={dash.popularPosts24h} emptyText="No popular posts in last 24h." />
          </Card>

          <Card
            title="Highlighted Posts"
            subtitle="whitelist + official users"
            collapsed={collapsed.highlights}
            onToggle={() => setCollapsed((c) => ({ ...c, highlights: !c.highlights }))}
            overview={
              dash.preview.topHighlight ? (
                <div>
                  <span className="mono">@{dash.preview.topHighlight.user.username}</span>:{" "}
                  {dash.preview.topHighlight.body.slice(0, 140)}
                  {dash.preview.topHighlight.body.length > 140 ? "…" : ""}
                </div>
              ) : (
                <div className="muted">No highlighted posts.</div>
              )
            }
          >
            <PostsList posts={dash.highlightedPosts} emptyText="No highlighted posts found." />
          </Card>

          <div className="card full">
            <Card
              title="Advanced Stats"
              subtitle="Daily series + price overlay (if FINNHUB_API_KEY is set)"
              collapsed={collapsed.charts}
              onToggle={() => setCollapsed((c) => ({ ...c, charts: !c.charts }))}
              overview={<div className="muted">Charts are intentionally limited to keep iOS PWA fast.</div>}
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
