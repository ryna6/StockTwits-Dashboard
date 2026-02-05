export type WhitelistUser = {
  username: string; // StockTwits username (exact match)
  name?: string;    // Optional real name / display label
};

export type TickerConfig = {
  symbol: string;           // "RCAT"
  displayName: string;      // "Red Cat Holdings"
  logoUrl?: string;         // optional
  whitelistUsers: WhitelistUser[]; // username + optional display name
  manualEvents?: {
    label: string;
    dateISO: string; // YYYY-MM-DD
  }[];
};

export type MessageLite = {
  id: number;
  createdAt: string; // ISO
  body: string;
  hasMedia: boolean;

  user: {
    id: number;
    username: string;
    displayName?: string; // <-- optional "real name" for whitelisted users
    followers: number;
    joinDate?: string;
    official?: boolean;
  };

  // StockTwits tags (user-provided) - stored but NOT used as the model
  stSentimentBasic?: "Bullish" | "Bearish" | null;

  // Our model sentiment
  modelSentiment: {
    score: number; // [-1..+1]
    label: "bull" | "neutral" | "bear";
  };

  likes: number;
  replies: number;

  symbolsTagged: string[];
  links: {
    url: string;
    title?: string;
    source?: string;
  }[];

  spam: {
    score: number; // 0..1
    reasons: string[];
    normalizedHash?: string;
  };
};

export type DashboardResponse = {
  symbol: string;
  displayName: string;

  lastSyncAt?: string;
  watchers?: number | null;

  sentiment24h: {
    score: number; // [-1..+1]
    label: "bull" | "neutral" | "bear";
    sampleSize: number;
    vsPrevDay?: number | null;
  };

  volume24h: {
    clean: number;
    total: number;
    buzzMultiple?: number | null;
  };

  summary24h: {
    tldr: string;
    themes: { name: string; count: number }[];
    evidencePosts: Pick<MessageLite, "id" | "createdAt" | "body" | "user" | "likes" | "replies" | "links">[];
    keyLinks: { url: string; title?: string; domain: string; count: number }[];
  };

  popularPosts24h: MessageLite[];
  highlightedPosts: MessageLite[];

  // for rendering
  preview: {
    topPost?: MessageLite | null;
    topHighlight?: MessageLite | null;
    topLink?: { url: string; title?: string; domain: string; count: number } | null;
  };
};

export type DailySeriesPoint = {
  date: string; // YYYY-MM-DD (UTC)
  volumeClean: number;
  volumeTotal: number;
  sentimentMean: number | null; // mean model sentiment
  watchers: number | null;
  close: number | null;
};

export type StatsResponse = {
  symbol: string;
  rangeDays: number;
  points: DailySeriesPoint[];
  hasWatchers: boolean;
  hasPrice: boolean;
};
