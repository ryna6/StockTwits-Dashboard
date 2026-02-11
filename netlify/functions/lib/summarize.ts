import type { MessageLite } from "../../../shared/types";

type ThemeRule = { name: string; re: RegExp };

const THEME_RULES: ThemeRule[] = [
  { name: "Contracts/Awards", re: /\b(contract|contracts|award|awarded|order|orders|procurement|backlog|dod|army|navy|air force)\b/i },
  { name: "LOI/Partnership", re: /\b(loi|letter of intent|partnership|partner|collaboration|joint venture|strategic)\b/i },
  { name: "Revenue/Guidance", re: /\b(revenue|guidance|forecast|outlook|eps|margin|profitability|bookings)\b/i },
  { name: "Dilution/Offering", re: /\b(dilution|offering|atm|warrant|convertible|s-3)\b/i },
  { name: "Listing/Compliance", re: /\b(nasdaq compliance|compliance|deficiency|reverse split|listing|uplist)\b/i },
  { name: "Earnings", re: /\b(earnings|quarter|q1|q2|q3|q4|10-q|10-k)\b/i },
  { name: "FDA/Clinical", re: /\b(fda|trial|phase [1-4]|pdufa|clinical|endpoint)\b/i },
  { name: "M&A", re: /\b(acquisition|acquire|merger|buyout)\b/i },
  { name: "Filings/PR", re: /\b(sec filing|8-k|press release|pr|filing)\b/i },
  { name: "Price Target", re: /\b(price target|pt\b|target raise|target cut|upgrade|downgrade)\b/i }
];

function engagementScore(m: MessageLite): number {
  return (m.likes ?? 0) * 2 + (m.replies ?? 0) * 3 + Math.log10((m.user?.followers ?? 0) + 10);
}

function sentenceFromPost(m: MessageLite): string {
  const body = (m.body ?? "").replace(/\s+/g, " ").trim();
  const short = body.length > 180 ? `${body.slice(0, 177)}...` : body;
  return `@${m.user.username} noted: ${short || "(media-only post)"}.`;
}

function uniqueById(messages: MessageLite[]): MessageLite[] {
  const seen = new Set<number>();
  const out: MessageLite[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function build24hSummary(args: {
  cleanMessages: MessageLite[];
  popular: MessageLite[];
  highlights: MessageLite[];
  sentimentScore24h: number;
  vsPrevDay: number | null;
}) {
  const msgs = args.cleanMessages.slice(0, 800);

function topThemes(messages: MessageLite[]) {
  const counts: Record<string, number> = {};
  for (const m of messages) {
    for (const t of THEME_RULES) {
      if (t.re.test(m.body || "")) counts[t.name] = (counts[t.name] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));
}

  const direction = args.sentimentScore24h > 0.15 ? "bullish" : args.sentimentScore24h < -0.15 ? "bearish" : "mixed";
  const deltaText =
    typeof args.vsPrevDay === "number"
      ? ` Versus the prior day, net sentiment moved ${args.vsPrevDay >= 0 ? "up" : "down"} by ${Math.abs(args.vsPrevDay).toFixed(2)}.`
      : "";

  const keyUsers = args.highlights
    .slice()
    .sort((a, b) => engagementScore(b) - engagementScore(a))
    .slice(0, 2);

  const popular = args.popular.slice(0, 2);
  const broader = args.cleanMessages
    .slice()
    .sort((a, b) => engagementScore(b) - engagementScore(a))
    .slice(0, 2);

  const evidence = uniqueById([...keyUsers, ...popular, ...broader]).slice(0, 6);

  const sentences: string[] = [];
  sentences.push(
    `${args.symbol} chatter over the last 24 hours was ${direction} across ${args.cleanMessages.length} clean posts, weighted most heavily toward key users and high-engagement messages.${deltaText}`.trim()
  );

  if (themes.length > 0) {
    sentences.push(`Catalyst discussion centered on ${themes.slice(0, 3).map((t) => `${t.name} (${t.count})`).join(", ")}.`);
  } else {
    sentences.push("No single catalyst cluster dominated; discussion was broad and post-specific.");
  }

  if (keyUsers.length > 0) sentences.push(`Key-user signal: ${sentenceFromPost(keyUsers[0])}`);
  if (popular.length > 0) sentences.push(`High-engagement signal: ${sentenceFromPost(popular[0])}`);
  if (broader.length > 0) sentences.push(`Broader-post signal: ${sentenceFromPost(broader[0])}`);

  const longSummary = sentences.slice(0, 5).join(" ");

  return {
    longSummary,
    themes,
    evidencePosts: evidence.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      body: m.body,
      user: m.user,
      likes: m.likes,
      replies: m.replies,
      links: m.links
    }))
  };
}
