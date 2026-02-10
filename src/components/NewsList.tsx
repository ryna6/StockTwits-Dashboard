import React from "react";
import { timeAgo } from "../lib/format";

type NewsItem = {
  id: number;
  url: string;
  title: string;
  source: string;
  publishedAt?: string;
};

export default function NewsList(props: { links: NewsItem[] | null | undefined }) {
  const links = props.links ?? [];
  if (!links.length) return <div className="muted">No news found.</div>;

  return (
    <div className="newsList">
      {links.map((l) => (
        <a key={l.id} className="newsItem" href={l.url} target="_blank" rel="noreferrer">
          <div className="newsSourceRow">
            <div className="newsSource">{l.source ?? "stocktwits"}</div>
            {l.publishedAt ? <div className="newsTime">shared {timeAgo(l.publishedAt)}</div> : null}
          </div>
          <div className="newsTitle">{l.title ?? l.url}</div>
          <div className="newsUrl">{l.url}</div>
        </a>
      ))}
    </div>
  );
}
