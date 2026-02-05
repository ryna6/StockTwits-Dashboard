import React, { useEffect, useMemo, useRef, useState } from "react";

type Opt = { symbol: string; displayName: string; logoUrl?: string };

export default function TickerPicker(props: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => {
    const s = props.value?.toUpperCase();
    return props.options.find((o) => o.symbol.toUpperCase() === s) ?? null;
  }, [props.value, props.options]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="tickerPicker">
      <div className="tickerLabelInline">Ticker</div>

      <div className="tickerWrap" ref={wrapRef}>
        <button
          type="button"
          className="tickerButton"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
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
            <div className="tickerLogoPlaceholder" />
          )}

          <div className="tickerButtonText">
            <div className="tickerSymbol">{selected?.symbol ?? props.value}</div>
            <div className="tickerName">{selected?.displayName ?? ""}</div>
          </div>

          <div className="tickerChevron">▾</div>
        </button>

        {open ? (
          <div className="tickerMenu" role="listbox">
            {props.options.map((o) => (
              <button
                key={o.symbol}
                type="button"
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
                  <div className="tickerLogoPlaceholder" />
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
    </div>
  );
}
