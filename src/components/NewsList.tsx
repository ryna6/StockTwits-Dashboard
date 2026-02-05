import React from "react";

export default function NewsList(props: {
  links: { url: string; title?: string; domain: string; count: number }[];
}) {
  if (!props.links || props.links.length === 0) return <div className="muted">No links extracted.</div>;

  return (
    <div className="news">
      {props.links.map((l) => (
        <a key={l.url} className="newsItem" href={l.url} target="_blank" rel="noreferrer">
          <div className="newsTop">
            <span className="newsDomain">{l.domain}</span>
            <span className="newsCount">{l.count}×</span>
          </div>
          <div className="newsTitle">{l.title ?? l.url}</div>
        </a>
      ))}
    </div>
  );
}

