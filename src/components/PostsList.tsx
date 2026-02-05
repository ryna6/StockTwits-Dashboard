import React from "react";
import type { MessageLite } from "../../shared/types";

function openStockTwits(username: string, id: number) {
  window.open(`https://stocktwits.com/${encodeURIComponent(username)}/message/${id}`, "_blank");
}

// Some API payloads (e.g., Summary evidencePosts) may be partial objects
// that don't include spam/modelSentiment. This component must never crash.
type PostLike = Partial<MessageLite> & {
  id: number;
  user: { username: string; official?: boolean; displayName?: string };
  createdAt?: string;
  body?: string;
};

export default function PostsList(props: { posts: PostLike[]; emptyText: string }) {
  if (!props.posts || props.posts.length === 0) {
    return <div className="muted">{props.emptyText}</div>;
  }

  return (
    <div className="posts">
      {props.posts.map((p) => {
        const username = p.user?.username ?? "unknown";
        const displayName = p.user?.displayName?.trim();

        const spamScore = (p as any)?.spam?.score ?? 0;
        const isSpam = spamScore >= 0.75;

        const msLabel = (p as any)?.modelSentiment?.label ?? "neutral";
        const msScoreNum = Number((p as any)?.modelSentiment?.score ?? 0);

        const hasMedia = Boolean((p as any)?.hasMedia ?? false);
        const body = (p.body ?? "").trim();

        const likes = Number((p as any)?.likes ?? 0);
        const replies = Number((p as any)?.replies ?? 0);

        const links: { url: string; title?: string }[] = Array.isArray((p as any)?.links) ? (p as any).links : [];

        return (
          <div key={p.id} className="post">
            <div className="postTop">
              <div className="postUser">
                {displayName ? (
                  <>
                    <span>{displayName}</span>
                    <span className="muted">{" "}</span>
                    <span className="mono">(@{username})</span>
                  </>
                ) : (
                  <span className="mono">@{username}</span>
                )}

                {p.user?.official ? <span className="badge">official</span> : null}
                {isSpam ? <span className="badge warn">spam</span> : null}
              </div>

              <button className="linkBtn" onClick={() => openStockTwits(username, p.id)}>
                open
              </button>
            </div>

            <div className="postBody">
              {body ? body : hasMedia ? "(Image/GIF post)" : "(Empty post)"}
            </div>

            <div className="postMeta">
              <span>❤ {likes}</span>
              <span>↩ {replies}</span>
              <span className="muted">
                sent: {msLabel} ({msScoreNum.toFixed(2)})
              </span>
            </div>

            {links.length ? (
              <div className="postLinks">
                {links.slice(0, 3).map((l) => (
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
