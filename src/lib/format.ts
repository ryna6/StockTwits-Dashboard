export function fmtInt(n: number) {
  return new Intl.NumberFormat().format(n);
}

export function fmtPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function fmtScore(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const d = Date.now() - t;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

