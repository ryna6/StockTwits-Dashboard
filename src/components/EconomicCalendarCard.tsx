import React, { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import { apiEconCalendar, type EconCalendarResponse } from "../lib/api";
import { timeAgo } from "../lib/format";

type RangeKey = "today" | "this_week" | "next_week";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  this_week: "This Week",
  next_week: "Next Week"
};

function fmtEtDate(offsetDays = 0): string {
  const now = new Date();
  const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  etNow.setDate(etNow.getDate() + offsetDays);
  return etNow.toISOString().slice(0, 10);
}

function startOfWeekEt(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + delta);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeFor(view: RangeKey): { start: string; end: string } {
  if (view === "today") {
    const day = fmtEtDate(0);
    return { start: day, end: day };
  }

  const etNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const thisMonday = startOfWeekEt(etNow);
  if (view === "this_week") {
    const end = new Date(thisMonday);
    end.setDate(end.getDate() + 6);
    return { start: toYmd(thisMonday), end: toYmd(end) };
  }

  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextSunday.getDate() + 6);
  return { start: toYmd(nextMonday), end: toYmd(nextSunday) };
}

function fmtValue(v: number | string | null, unit: string | null): string {
  if (v == null) return "—";
  const asText = typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v;
  if (!unit) return asText;
  if (unit === "%") return `${asText}%`;
  return `${asText} ${unit}`;
}

function fmtNum(v: number | null, isPct = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}${isPct ? "%" : ""}`;
}

export default function EconomicCalendarCard() {
  const [collapsed, setCollapsed] = useState(true);
  const [view, setView] = useState<RangeKey>("today");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EconCalendarResponse | null>(null);

  const range = useMemo(() => rangeFor(view), [view]);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const out = await apiEconCalendar(range.start, range.end, force);
      setData(out);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  const byDate = useMemo(() => {
    const grouped = new Map<string, EconCalendarResponse["events"]>();
    for (const ev of data?.events ?? []) {
      const existing = grouped.get(ev.date) ?? [];
      existing.push(ev);
      grouped.set(ev.date, existing);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <div className="card full">
      <Card
        title="Economic Calendar"
        collapsed={collapsed}
        onToggle={() => setCollapsed((x) => !x)}
        overview={
          <div className="econOverview">
            <div className="muted">{data?.events?.length ?? 0} events</div>
            <div className="muted">Updated {data?.meta?.lastUpdated ? timeAgo(data.meta.lastUpdated) : "—"}</div>
          </div>
        }
      >
        <div className="econToolbar">
          <div className="econTabs">
            {(["today", "this_week", "next_week"] as RangeKey[]).map((k) => (
              <button key={k} className={`econTab ${view === k ? "active" : ""}`} onClick={() => setView(k)}>
                {RANGE_LABEL[k]}
              </button>
            ))}
          </div>
          <button className="refreshBtn" onClick={() => void load(true)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error ? <div className="errorBody">{error}</div> : null}

        <div className="muted econSourceNote">
          Schedule / actual / previous: FRED. Forecast/consensus: Investing.com scrape when available.
        </div>
        <div className="muted econSourceNote">{data?.meta?.note ?? ""}</div>

        {byDate.map(([date, events]) => (
          <div key={date} className="econDateGroup">
            <div className="sectionTitle">{date}</div>
            <div className="econTableWrap">
              <table className="econTable">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Actual</th>
                    <th>Forecast</th>
                    <th>Previous</th>
                    <th>Change</th>
                    <th>% Change</th>
                    <th>Importance</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={`${ev.date}:${ev.key}`}>
                      <td>{ev.timeET ?? "—"}</td>
                      <td>{ev.name}</td>
                      <td className={`econResult ${ev.goodBad}`}>{fmtValue(ev.actual, ev.unit)}</td>
                      <td>{fmtValue(ev.consensus, ev.unit)}</td>
                      <td>{fmtValue(ev.previous, ev.unit)}</td>
                      <td>{fmtNum(ev.change)}</td>
                      <td>{fmtNum(ev.pctChange, true)}</td>
                      <td>
                        <span className={`chip econImp ${ev.importance}`}>{ev.importance}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
