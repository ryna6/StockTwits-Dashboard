import React from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import { Chart } from "react-chartjs-2";
import type { StatsResponse } from "../../shared/types";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

export default function ChartPanel(props: { stats: StatsResponse | null }) {
  const s = props.stats;
  const points = Array.isArray(s?.points) ? s!.points : [];

  if (!s || points.length === 0) {
    return <div className="muted">No stats available yet. Refresh to sync data.</div>;
  }

  const labels = points.map((p) => p.date ?? "");
  const vol = points.map((p) => Number(p?.volumeClean ?? 0));
  const sent = points.map((p) => (typeof p?.sentimentMean === "number" ? Number(p.sentimentMean.toFixed(1)) : null));
  const watchers = points.map((p) => (typeof p?.watchers === "number" ? p.watchers : null));
  const close = points.map((p) => (typeof p?.priceClose === "number" ? p.priceClose : null));

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true } },
    scales: {
      y: { beginAtZero: false },
      y1: { beginAtZero: false, position: "right" as const, grid: { drawOnChartArea: false } }
    }
  };

  return (
    <div>
      <div className="muted" style={{ marginBottom: 10 }}>Daily points over the last 3 months.</div>
      {!s.hasPrice ? <div className="muted" style={{ marginBottom: 10 }}>Price unavailable (showing stat series only).</div> : null}

      <div className="chartBlock">
        <div className="chartTitle">Watchers & Stock Price vs Time</div>
        <Chart
          type="line"
          data={{
            labels,
            datasets: [
              { label: "Watchers", data: watchers as any, yAxisID: "y", borderWidth: 2.5, tension: 0.2, borderColor: "#84ccff", pointRadius: 0 },
              ...(s.hasPrice ? [{ label: "Price Close", data: close as any, yAxisID: "y1", borderWidth: 1.5, tension: 0.2, borderColor: "#ffb347", pointRadius: 0 }] : [])
            ]
          }}
          options={commonOptions}
        />
      </div>

      <div className="chartBlock">
        <div className="chartTitle">Message Volume & Stock Price vs Time</div>
        <Chart
          type="bar"
          data={{
            labels,
            datasets: [
              { label: "Messages (clean)", data: vol, yAxisID: "y", backgroundColor: "rgba(116, 186, 255, 0.45)", borderColor: "#74baff", borderWidth: 1 },
              ...(s.hasPrice ? [{ label: "Price Close", data: close as any, type: "line" as const, yAxisID: "y1", borderWidth: 1.5, tension: 0.2, borderColor: "#ffb347", pointRadius: 0 }] : [])
            ]
          }}
          options={{ ...commonOptions, scales: { ...commonOptions.scales, y: { beginAtZero: true } } }}
        />
      </div>

      <div className="chartBlock">
        <div className="chartTitle">Stock Sentiment & Stock Price vs Time</div>
        <Chart
          type="line"
          data={{
            labels,
            datasets: [
              { label: "Sentiment mean", data: sent as any, yAxisID: "y", borderWidth: 2.5, tension: 0.2, borderColor: "#8b7dff", pointRadius: 0 },
              ...(s.hasPrice ? [{ label: "Price Close", data: close as any, yAxisID: "y1", borderWidth: 1.5, tension: 0.2, borderColor: "#ffb347", pointRadius: 0 }] : [])
            ]
          }}
          options={{ ...commonOptions, scales: { ...commonOptions.scales, y: { min: 0, max: 100 } } }}
        />
      </div>
    </div>
  );
}
