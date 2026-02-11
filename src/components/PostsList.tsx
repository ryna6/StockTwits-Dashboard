import React from "react";
import type { MessageLite } from "../../shared/types";
import { timeAgo } from "../lib/format";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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

function labelFromIndex(index: number): "bull" | "bear" | "neutral" {
  if (index >= 55) return "bull";
  if (index <= 45) return "bear";
  return "neutral";
}

function modelToIndex(score: number) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 50;
  if (s >= 0 && s <= 100) return Math.round(s);
  return clamp(Math.round(((clamp(s, -1, 1) + 1) / 2) * 100), 0, 100);
}

function userSentimentToIndex(sentiment?: "Bullish" | "Bearish" | null): number | null {
  if (sentiment === "Bullish") return 75;
  if (sentiment === "Bearish") return 25;
  return null;
}

function finalIndexForPost(p: any): number {
  const userSent = (p?.userSentiment ?? p?.stSentimentBasic ?? null) as "Bullish" | "Bearish" | null;
  const userIdx = userSentimentToIndex(userSent);
  const modelIdx = modelToIndex(Number(p?.modelSentiment?.score ?? p?.finalSentimentIndex ?? 50));

  if (userIdx !== null) return clamp(Math.round(0.7 * userIdx + 0.3 * modelIdx), 0, 100);
  return clamp(Math.round(modelIdx), 0, 100);
}

function openStockTwits(username: string, id: number) {
  window.open(`https://stocktwits.com/${encodeURIComponent(username)}/message/${id}`, "_blank");
}

type PostLike = Partial<MessageLite> & {
  id: number;
  user?: { username?: string; official?: boolean; displayName?: string };
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

export default function PostsList(props: { posts?: PostLike[]; emptyText: string }) {
  const posts = Array.isArray(props.posts) ? props.posts : [];
  if (posts.length === 0) return <div className="muted">{props.emptyText}</div>;

  return (
    <div className="posts">
      {posts.map((p) => {
        const username = p.user?.username ?? "unknown";
        const displayName = p.user?.displayName?.trim();
        const spamScore = Number((p as any)?.spam?.score ?? 0);
        const isSpam = spamScore >= 0.75;

        const finalIdx = finalIndexForPost(p as any);
        const sentimentLabel = labelFromIndex(finalIdx);

        const msIdx = modelToIndex(Number((p as any)?.modelSentiment?.score ?? 50));
        const msLabel = labelFromIndex(msIdx);

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
                    <span className="muted"> </span>
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
              <span className={"metaItem sentiment " + sentimentLabel}>Final: {labelText(sentimentLabel)} ({finalIdx})</span>
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
