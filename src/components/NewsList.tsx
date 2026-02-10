import React from "react";
import type { NewsItem } from "../../shared/types";
import { timeAgo } from "../lib/format";

export default function NewsList(props: { symbol: string; news: NewsItem[] | null | undefined }) {
  const items = props.news ?? [];
  if (!items.length) return <div className="muted">No news found.</div>;

  const fallbackUrl = `https://stocktwits.com/symbol/${encodeURIComponent(props.symbol)}/news`;

  return (
    <div className="newsList">
      {items.map((n, i) => {
        const url = n.url || fallbackUrl;
        const key = (n.url || `${n.title}-${i}`).slice(0, 200);
        const src = (n.source ?? "").trim();

        return (
          <a key={key} className="newsItem" href={url} target="_blank" rel="noreferrer">
            <div className="newsSourceRow">
              <div className="newsSource">{src ? src : "stocktwits"}</div>
              {n.publishedAt ? <div className="newsTime">published {timeAgo(n.publishedAt)}</div> : null}
            </div>
            <div className="newsTitle">{n.title ?? url}</div>
            <div className="newsUrl">{url}</div>
          </a>
        );
      })}

      <a className="newsFooterLink" href={fallbackUrl} target="_blank" rel="noreferrer">
        View all on StockTwits →
      </a>
    </div>
  );
}
