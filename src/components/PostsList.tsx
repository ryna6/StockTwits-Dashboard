import React from "react";
import type { MessageLite } from "../../shared/types";
import { timeAgo } from "../lib/format";

function openStockTwits(username: string, id: number) {
  window.open(`https://stocktwits.com/${encodeURIComponent(username)}/message/${id}`, "_blank");
}

// Allow partial objects safely (some lists may not include full schema)
type PostLike = Partial<MessageLite> & {
  id: number;
  user: { username: string; official?: boolean; displayName?: string };
  createdAt?: string;
  body?: string;
  replyTo?: {
    id: number;
    createdAt?: string;
    user?: { username?: string; displayName?: string };
    body?: string;
  };
  replyToId?: number | null;
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

        const likes = Number((p as any)?.likes ?? 0);
        const replies = Number((p as any)?.replies ?? 0);

        const hasMedia = Boolean((p as any)?.hasMedia ?? false);
        const body = (p.body ?? "").trim();

        const createdAt = p.createdAt ?? null;
        const replyTo = (p as any)?.replyTo ?? null;
        const replyToId = (p as any)?.replyToId ?? null;

        return (
          <div
            key={p.id}
            className="post"
            role="button"
            tabIndex={0}
            onClick={() => openStockTwits(username, p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openStockTwits(username, p.id);
            }}
          >
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

                {p.user?.official ? <span className="badge">Official</span> : null}
                {isSpam ? <span className="badge warn">spam</span> : null}
              </div>

              <div className="postTime">{createdAt ? `sent ${timeAgo(createdAt)}` : ""}</div>
            </div>

            {/* Reply context (if available) */}
            {replyTo ? (
              <div className="replyContext" onClick={(e) => e.stopPropagation()}>
                <div className="replyHeader">
                  Replying to{" "}
                  <span className="mono">
                    @{replyTo.user?.username ?? "unknown"}
                  </span>
                  {replyTo.createdAt ? <span className="muted"> • {timeAgo(replyTo.createdAt)}</span> : null}
                </div>
                <div className="replyBody">
                  {(replyTo.body ?? "").trim().slice(0, 220)}
                  {(replyTo.body ?? "").length > 220 ? "…" : ""}
                </div>
              </div>
            ) : replyToId ? (
              <div className="replyContext muted" onClick={(e) => e.stopPropagation()}>
                Replying to message #{replyToId}
              </div>
            ) : null}

            <div className="postBody">
              {body ? body : hasMedia ? "(Image/GIF post)" : "(Empty post)"}
            </div>

            <div className="postMeta">
              <span className="metaItem">❤ {likes}</span>
              <span className="metaItem">↩ {replies}</span>
              <span className="metaItem muted">
                sentiment: {msLabel} ({msScoreNum.toFixed(2)})
              </span>
            </div>

            {/* If the post contains links, show them (clickable without triggering open-to-StockTwits) */}
            {Array.isArray((p as any)?.links) && (p as any).links.length ? (
              <div className="postLinks" onClick={(e) => e.stopPropagation()}>
                {(p as any).links.slice(0, 3).map((l: any) => (
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
