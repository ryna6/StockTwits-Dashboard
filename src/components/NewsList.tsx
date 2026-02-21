import React from "react";
import { timeAgo } from "../lib/format";

type NewsItem = {
  id: string;
  url: string;
  headline: string;
  summary: string;
  source: string;
  datetime: number;
};

export default function NewsList(props: { links: NewsItem[] | null | undefined }) {
  const links = props.links ?? [];
  if (!links.length) return <div className="muted">No news available.</div>;

  return (
    <div className="newsList">
      {links.map((l) => (
        <div key={l.id} className="newsItem">
          <div className="newsTitle">{l.headline ?? l.url}</div>
          <div className="newsSummary">{l.summary}</div>
          <a className="newsUrl" href={l.url} target="_blank" rel="noreferrer">
            {l.url}
          </a>
          <div className="newsSourceRow">
            <div className="newsSource">{l.source ?? "finnhub"}</div>
            {l.datetime ? <div className="newsTime">posted {timeAgo(new Date(l.datetime * 1000).toISOString())}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
