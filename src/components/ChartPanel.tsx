import React from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import { Chart } from "react-chartjs-2";
import type { StatsResponse } from "../../shared/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

export default function ChartPanel(props: {
  stats: StatsResponse | null;
  range: 30 | 90 | 365;
  onRange: (r: 30 | 90 | 365) => void;
}) {
  const s = props.stats;
  if (!s) return <div className="muted">Loading charts…</div>;

  const labels = s.points.map((p) => p.date);
  const vol = s.points.map((p) => p.volumeClean);
  const sent = s.points.map((p) => (p.sentimentMean === null ? 0 : p.sentimentMean));
  const watchers = s.points.map((p) => (p.watchers === null ? null : p.watchers));
  const close = s.points.map((p) => (p.close === null ? null : p.close));

  return (
    <div>
      <div className="rangeRow">
        {[30, 90, 365].map((r) => (
          <button
            key={r}
            className={"rangeBtn " + (props.range === r ? "active" : "")}
            onClick={() => props.onRange(r as any)}
          >
            {r === 30 ? "1m" : r === 90 ? "3m" : "12m"}
          </button>
        ))}
      </div>

      <div className="chartBlock">
        <div className="chartTitle">Daily Volume (clean) + Price</div>
        <Chart
          type="bar"
          data={{
            labels,
            datasets: [
              { label: "Messages (clean)", data: vol, yAxisID: "y" },
              ...(s.hasPrice ? [{ label: "Close", data: close as any, type: "line" as const, yAxisID: "y1" }] : [])
            ]
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: {
              y: { beginAtZero: true },
              y1: { beginAtZero: false, position: "right", grid: { drawOnChartArea: false } }
            }
          }}
        />
      </div>

      <div className="chartBlock">
        <div className="chartTitle">Daily Sentiment (clean) + Price</div>
        <Chart
          type="line"
          data={{
            labels,
            datasets: [
              { label: "Sentiment mean", data: sent, yAxisID: "y" },
              ...(s.hasPrice ? [{ label: "Close", data: close as any, yAxisID: "y1" }] : [])
            ]
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: {
              y: { beginAtZero: false },
              y1: { beginAtZero: false, position: "right", grid: { drawOnChartArea: false } }
            }
          }}
        />
      </div>

      {s.hasWatchers ? (
        <div className="chartBlock">
          <div className="chartTitle">Watchers + Price</div>
          <Chart
            type="line"
            data={{
              labels,
              datasets: [
                { label: "Watchers", data: watchers as any, yAxisID: "y" },
                ...(s.hasPrice ? [{ label: "Close", data: close as any, yAxisID: "y1" }] : [])
              ]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true } },
              scales: {
                y: { beginAtZero: false },
                y1: { beginAtZero: false, position: "right", grid: { drawOnChartArea: false } }
              }
            }}
          />
        </div>
      ) : (
        <div className="muted">Watchers series not available yet for this symbol.</div>
      )}
    </div>
  );
}

