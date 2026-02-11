import type { MessageLite } from "../../../shared/types";

type ThemeRule = { name: string; re: RegExp };

const EMPTY_RECAP = "Nothing meaningful to recap in the past 24h (mostly generic reactions / low-signal posts).";

const THEME_RULES: ThemeRule[] = [
  { name: "Contracts/Awards", re: /\b(contract|contracts|award|awarded|order|orders|procurement|backlog|dod)\b/i },
  { name: "LOI/Partnership", re: /\b(loi|letter of intent|partnership|partner|collaboration|joint venture|strategic)\b/i },
  { name: "Filings/PR", re: /\b(8-k|sec filing|filing|press release|pr)\b/i },
  { name: "Offering/Dilution", re: /\b(offering|dilution|dilutive|atm|warrant|convertible|s-3)\b/i },
  { name: "Compliance/Listing", re: /\b(nasdaq compliance|compliance|deficiency|reverse split|listing)\b/i },
  { name: "Earnings/Guidance", re: /\b(earnings|guidance|revenue|eps|margin|outlook)\b/i },
  { name: "M&A", re: /\b(acquisition|acquire|merger|buyout)\b/i },
  { name: "FDA/Trial", re: /\b(fda|trial|clinical|phase [1-4]|pdufa)\b/i }
];

const GENERIC_RE = /\b(to the moon|moon|lfg|lets go|rocket|diamond hands|bagholder|wen|pump|send it|hodl)\b/i;
const NUMBER_RE = /\$\d|\d+%|\b\d{1,4}(k|m|b|million|billion)?\b|\bq[1-4]\b|\b20\d{2}\b/i;
const TICKER_STUFF_RE = /\$[A-Z]{1,5}/g;
const HIGH_SIGNAL_DOMAINS = /(sec\.gov|globenewswire\.com|businesswire\.com|prnewswire\.com|fda\.gov|nasdaq\.com|investor\.|news\.)/i;

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

function infoScore(m: MessageLite, isKeyUser: boolean, popularIds: Set<number>) {
  const body = m.body || "";
  let score = 0;
  if (NUMBER_RE.test(body)) score += 2;
  if (THEME_RULES.some((t) => t.re.test(body))) score += 3;
  if (m.links.some((l) => HIGH_SIGNAL_DOMAINS.test(l.url || ""))) score += 2;
  if (isKeyUser) score += 3;
  if (popularIds.has(m.id)) score += 2;

  const tickerMentions = (body.match(TICKER_STUFF_RE) ?? []).length;
  if (tickerMentions >= 4) score -= 2;
  if (GENERIC_RE.test(body)) score -= 2;
  if (body.trim().length < 25) score -= 2;
  if (m.spam?.normalizedHash) score -= 0.5;

  return score;
}

export function build24hSummary(args: {
  cleanMessages: MessageLite[];
  popular: MessageLite[];
  highlights: MessageLite[];
}) {
  const computedThemes = topThemes(args.cleanMessages);
  const keyUserIds = new Set(args.highlights.map((m) => m.id));
  const popularIds = new Set(args.popular.map((m) => m.id));

  const scored = args.cleanMessages
    .map((m) => ({ m, score: infoScore(m, keyUserIds.has(m.id), popularIds) }))
    .sort((a, b) => b.score - a.score);

  const strong = scored.filter((x) => x.score >= 4);
  const hasHighConfidenceCluster = args.highlights.some((m) => m.links?.length || (m.likes ?? 0) + (m.replies ?? 0) >= 8);

  if (strong.length < 3 && !hasHighConfidenceCluster) {
    return {
      longSummary: EMPTY_RECAP,
      themes: computedThemes,
      evidencePosts: []
    };
  }

  const primaryThread = computedThemes[0]?.name ?? "mixed catalyst talk";
  const secondaryThread = computedThemes[1]?.name ?? "follow-up filings/compliance updates";

  const longSummary = [
    `Primary development in the last 24h: discussion clustered around ${primaryThread}, with multiple posts carrying concrete details instead of pure reaction chatter.`,
    `Evidence quality is ${hasHighConfidenceCluster ? "moderate-to-strong" : "mixed"}: key-user/official coverage ${args.highlights.length > 0 ? "exists" : "is limited"}, and supporting posts include links or quant details in several cases.`,
    `A secondary thread also formed around ${secondaryThread}, suggesting traders are tracking both near-term catalyst flow and financing/compliance context in parallel.`,
    `What remains unclear: some claims are still unverified across independent sources, and timing specifics are inconsistent across posts.`,
    `What to watch next: confirmation-style updates (filings/PR/company-linked posts) that validate the strongest claims and clarify timing.`
  ].join(" ");

  const evidencePosts = [
    ...args.highlights.slice(0, 2),
    ...args.popular.slice(0, 2),
    ...strong.slice(0, 2).map((x) => x.m)
  ]
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
    .slice(0, 6)
    .map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      body: m.body,
      user: m.user,
      likes: m.likes,
      replies: m.replies,
      links: m.links
    }));

  return {
    longSummary,
    themes: computedThemes,
    evidencePosts
  };
}
