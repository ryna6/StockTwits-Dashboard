import React, { useEffect, useMemo, useRef, useState } from "react";

type Opt = { symbol: string; displayName: string; logoUrl?: string };

export default function TickerPicker(props: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => {
    const s = props.value?.toUpperCase();
    return props.options.find((o) => o.symbol.toUpperCase() === s) ?? null;
  }, [props.options, props.value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="tickerPicker" ref={wrapRef}>
      <div className="tickerLabel">Ticker</div>

      <button className="tickerButton" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        {selected?.logoUrl ? (
          <img
            className="tickerLogo"
            src={selected.logoUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="tickerLogo placeholder" />
        )}

        <div className="tickerButtonText">
          <div className="tickerSymbol">{selected?.symbol ?? props.value ?? "—"}</div>
          {!props.compact ? <div className="tickerName">{selected?.displayName ?? ""}</div> : null}
        </div>

        <div className="tickerChevron">▾</div>
      </button>

      {open ? (
        <div className="tickerMenu" role="listbox">
          {props.options.map((o) => (
            <button
              key={o.symbol}
              className={"tickerMenuItem" + (o.symbol === props.value ? " active" : "")}
              onClick={() => {
                props.onChange(o.symbol);
                setOpen(false);
              }}
            >
              {o.logoUrl ? (
                <img
                  className="tickerLogo"
                  src={o.logoUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="tickerLogo placeholder" />
              )}

              <div className="tickerMenuText">
                <div className="tickerSymbol">{o.symbol}</div>
                <div className="tickerName">{o.displayName}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
