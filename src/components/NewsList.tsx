import React from "react";
import { timeAgo } from "../lib/format";

type LinkItem = {
  url: string;
  title?: string;
  domain?: string;
  lastSharedAt?: string; // optional; backend can add later
};

export default function NewsList(props: { links: LinkItem[] | null | undefined }) {
  const links = props.links ?? [];
  if (!links.length) return <div className="muted">No links found.</div>;

  return (
    <div className="newsList">
      {links.map((l) => (
        <a key={l.url} className="newsItem" href={l.url} target="_blank" rel="noreferrer">
          <div className="newsSourceRow">
            <div className="newsSource">{l.domain ?? "source"}</div>
            {l.lastSharedAt ? <div className="newsTime">shared {timeAgo(l.lastSharedAt)}</div> : null}
          </div>
          <div className="newsTitle">{l.title ?? l.url}</div>
          <div className="newsUrl">{l.url}</div>
        </a>
      ))}
    </div>
  );
}
