export type WhitelistUser = {
  username: string;
  name?: string;
};

export type TickerConfig = {
  symbol: string;
  displayName: string;
  logoUrl?: string;
  whitelistUsers: WhitelistUser[];
  manualEvents?: { label: string; dateISO: string }[];
};

export type MessageLite = {
  id: number;
  createdAt: string;
  body: string;
  hasMedia: boolean;
  user: {
    id: number;
    username: string;
    displayName?: string;
    followers: number;
    joinDate?: string;
    official?: boolean;
  };
  stSentimentBasic?: "Bullish" | "Bearish" | null;
  userSentiment?: "Bullish" | "Bearish" | null;
  modelSentiment: { score: number; label: "bull" | "neutral" | "bear" };
  finalSentimentIndex?: number;
  finalSentimentLabel?: "bull" | "neutral" | "bear";
  likes: number;
  replies: number;
  symbolsTagged: string[];
  links: { url: string; title?: string; source?: string }[];
  spam: { score: number; reasons: string[]; normalizedHash?: string };
};

export type DashboardResponse = {
  symbol: string;
  displayName: string;
  lastSyncAt?: string;
  watchers?: number | null;
  watchersDelta?: number | null;

  sentiment24h: {
    score: number;
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
    longSummary: string;
    themes: { name: string; count: number }[];
    evidencePosts: Pick<MessageLite, "id" | "createdAt" | "body" | "user" | "likes" | "replies" | "links">[];
  };

  news24h: {
    id: string;
    headline: string;
    summary: string;
    url: string;
    source: string;
    datetime: number;
  }[];

  posts24h: MessageLite[];

  popularPosts24h: MessageLite[];
  highlightedPosts: MessageLite[];

  preview: {
    topPost?: MessageLite | null;
    topHighlight?: MessageLite | null;
  };
};

export type DailySeriesPoint = {
  date: string;
  volumeClean: number;
  volumeTotal: number;
  sentimentMean: number | null;
  watchers: number | null;
  priceClose: number | null;
};

export type StatsResponse = {
  symbol: string;
  rangeDays: number;
  points: DailySeriesPoint[];
  hasWatchers: boolean;
  hasPrice: boolean;
};
