import React from "react";
import type { MessageLite } from "../../shared/types";
import { timeAgo } from "../lib/format";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeModelLabel(label: any): "bull" | "bear" | "neutral" {
  const raw = String(label ?? "neutral").toLowerCase();
  if (raw === "bull" || raw === "bullish") return "bull";
  if (raw === "bear" || raw === "bearish") return "bear";
  return "neutral";
}

function labelText(label: "bull" | "bear" | "neutral") {
  switch (label) {
    case "bull":
      return "Bullish";
    case "bear":
      return "Bearish";
    default:
      return "Neutral";
  }
}

function sentimentToIndex(score: number) {
  const v = clamp(score, -1, 1);
  return Math.round(((v + 1) / 2) * 100);
}

function userSentimentToIndex(sentiment?: "Bullish" | "Bearish" | null): number | null {
  if (sentiment === "Bullish") return 75;
  if (sentiment === "Bearish") return 25;
  return null;
}

function openStockTwits(username: string, id: number) {
  window.open(`https://stocktwits.com/${encodeURIComponent(username)}/message/${id}`, "_blank");
}

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

        const msLabel = normalizeModelLabel((p as any)?.modelSentiment?.label);
        const msScoreNum = Number((p as any)?.modelSentiment?.score ?? 0);
        const msIdx = sentimentToIndex(msScoreNum);

        const userSent = ((p as any)?.userSentiment ?? (p as any)?.stSentimentBasic ?? null) as "Bullish" | "Bearish" | null;
        const usIdx = userSentimentToIndex(userSent);

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

            {replyTo ? (
              <div className="replyContext" onClick={(e) => e.stopPropagation()}>
                <div className="replyHeader">
                  Replying to <span className="mono">@{replyTo.user?.username ?? "unknown"}</span>
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

            <div className="postBody">{body ? body : hasMedia ? "(Image/GIF post)" : "(Empty post)"}</div>

            <div className="postMeta">
              <span className="metaItem">❤ {likes}</span>
              <span className="metaItem">↩ {replies}</span>
              {usIdx !== null ? (
                <span className={"metaItem sentiment user " + (userSent === "Bullish" ? "bull" : "bear")}>
                  User: {userSent} ({usIdx})
                </span>
              ) : null}
              <span className={"metaItem sentiment model " + msLabel}>Model: {labelText(msLabel)} ({msIdx})</span>
            </div>

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
