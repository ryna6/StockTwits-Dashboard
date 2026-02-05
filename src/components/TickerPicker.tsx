import React from "react";

export default function TickerPicker(props: {
  value: string;
  options: { symbol: string; displayName: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="tickerPicker">
      <label className="tickerLabel">Ticker</label>
      <select
        className="tickerSelect"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.symbol} value={o.symbol}>
            {o.symbol} — {o.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

