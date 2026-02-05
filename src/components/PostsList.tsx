import React from "react";
import type { MessageLite } from "../../shared/types";

function openStockTwits(username: string, id: number) {
  window.open(`https://stocktwits.com/${encodeURIComponent(username)}/message/${id}`, "_blank");
}

export default function PostsList(props: { posts: MessageLite[]; emptyText: string }) {
  if (!props.posts || props.posts.length === 0) {
    return <div className="muted">{props.emptyText}</div>;
  }

  return (
    <div className="posts">
      {props.posts.map((p) => {
        const name = p.user.displayName?.trim();
        return (
          <div key={p.id} className="post">
            <div className="postTop">
              <div className="postUser">
                {name ? (
                  <>
                    <span>{name}</span>
                    <span className="muted">{" "}</span>
                    <span className="mono">(@{p.user.username})</span>
                  </>
                ) : (
                  <span className="mono">@{p.user.username}</span>
                )}

                {p.user.official ? <span className="badge">official</span> : null}
                {p.spam.score >= 0.75 ? <span className="badge warn">spam</span> : null}
              </div>

              <button className="linkBtn" onClick={() => openStockTwits(p.user.username, p.id)}>
                open
              </button>
            </div>

            <div className="postBody">{p.body ? p.body : p.hasMedia ? "(Image/GIF post)" : "(Empty post)"}</div>

            <div className="postMeta">
              <span>❤ {p.likes}</span>
              <span>↩ {p.replies}</span>
              <span className="muted">
                sent: {p.modelSentiment.label} ({p.modelSentiment.score.toFixed(2)})
              </span>
            </div>

            {p.links?.length ? (
              <div className="postLinks">
                {p.links.slice(0, 3).map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="postLink">
                    {l.title ?? l.url}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
