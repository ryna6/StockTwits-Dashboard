import type { MessageLite } from "../../../shared/types";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

const THEME_RULES: { name: string; re: RegExp }[] = [
  { name: "Contracts", re: /\b(contract|contracts|award|order|orders|deal|SSR|fund|funds|suas|customer|army|procurement)\b/i },
  { name: "Earnings", re: /\b(earnings|guidance|revenue|eps|profit|margin)\b/i },
  { name: "Offering", re: /\b(offering|dilution|dilutive|s-3|atm|warrant)\b/i },
  { name: "Regulation", re: /\b(approval|approved|faa|certification|regulator)\b/i },
  { name: "Partnership", re: /\b(partnership|partner|strategic|collaboration|umac|pltr|pdyn)\b/i },
  { name: "Shorts", re: /\b(short|borrow|squeeze|cover)\b/i }
];

export function build24hSummary(args: {
  symbol: string;
  displayName: string;
  cleanMessages: MessageLite[];
  popular: MessageLite[];
  links: { url: string; title?: string }[];
  sentimentScore24h: number;
  vsPrevDay: number | null;
}) {
  const msgs = args.cleanMessages.slice(0, 500);

  const themeCounts: Record<string, number> = {};
  for (const m of msgs) {
    const body = m.body || "";
    for (const t of THEME_RULES) {
      if (t.re.test(body)) themeCounts[t.name] = (themeCounts[t.name] ?? 0) + 1;
    }
  }

  const themes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  // links grouped
  const linkCounts = new Map<string, { url: string; title?: string; domain: string; count: number }>();
  for (const l of args.links) {
    const key = l.url;
    const existing = linkCounts.get(key);
    if (existing) existing.count += 1;
    else linkCounts.set(key, { url: l.url, title: l.title, domain: domainOf(l.url), count: 1 });
  }

  const keyLinks = [...linkCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const direction =
    args.sentimentScore24h > 0.15 ? "bullish" : args.sentimentScore24h < -0.15 ? "bearish" : "mixed";

  const deltaPart =
    typeof args.vsPrevDay === "number"
      ? ` (vs prior day ${args.vsPrevDay >= 0 ? "+" : ""}${args.vsPrevDay.toFixed(2)})`
      : "";

  const themePart =
    themes.length > 0
      ? `Top themes: ${themes.map((t) => `${t.name} (${t.count})`).join("; ")}.`
      : "No dominant theme detected (chatter is broad).";

  const linkPart =
    keyLinks.length > 0
      ? `Most-shared link domain: ${keyLinks[0].domain}.`
      : "No widely-shared link stood out.";

  const tldr = `${args.symbol}: Retail tone is ${direction}${deltaPart}. ${themePart} ${linkPart}`;

  // evidence posts: pick top popular + 1 per top theme (if any)
  const evidence: MessageLite[] = [];
  for (const p of args.popular.slice(0, 3)) evidence.push(p);

  return {
    tldr,
    themes,
    evidencePosts: evidence.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      body: m.body,
      user: m.user,
      likes: m.likes,
      replies: m.replies,
      links: m.links
    })),
    keyLinks
  };
}

