export type SentLabel = "bull" | "bear" | "neutral";

export type ModelSentiment = {
  score: number; // [-1..1]
  label: SentLabel;
};

export type SpamInfo = {
  score: number; // [0..1]
  reasons: string[];
};

export type MessageLite = {
  id: number;
  createdAt: string; // ISO
  body: string;

  user: {
    id: number;
    username: string;
    name?: string;
    avatarUrl?: string;
    official?: boolean;
    followers?: number;
  };

  symbols?: string[];

  likes?: number;
  replies?: number;

  isReply?: boolean;
  inReplyTo?: {
    id: number;
    username?: string;
    body?: string;
  };

  links?: Array<{ url: string; title?: string; source?: string }>;

  spam: SpamInfo;
  modelSentiment: ModelSentiment;
};

export type KeyLink = {
  url: string;
  domain: string;
  count: number;
  lastSharedAt: string; // ISO of most recent message that shared this link
  title?: string;
};

export type NewsItem = {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  category?: string;
};

export type Summary24h = {
  tldr: string;
  themes: string[];
  evidencePosts: MessageLite[];
  keyLinks: KeyLink[];
};

export type SentimentSummary = {
  label: SentLabel;
  score: number; // [-1..1]
  sampleSize: number;
  vsPrevDay: number | null; // fraction change e.g. 0.12 = +12%
};

export type VolumeSummary = {
  clean: number;
  total: number;
  vsPrevDay: number | null; // fraction change
};

export type Preview = {
  topPost?: MessageLite;
  topHighlight?: MessageLite;
  topLink?: KeyLink;
};

export type DashboardResponse = {
  symbol: string;
  displayName: string;

  lastSyncAt: string | null; // ISO
  watchers: number | null;

  sentiment24h: SentimentSummary;
  volume24h: VolumeSummary;

  summary24h: Summary24h;

  // StockTwits "News" tab items (NOT user-shared links)
  news: NewsItem[];

  posts24h: MessageLite[];
  popularPosts24h: MessageLite[];
  highlightedPosts: MessageLite[];

  preview: Preview;
};

export type DailyPoint = {
  date: string; // YYYY-MM-DD
  volumeClean: number;
  volumeTotal: number;
  sentimentMean: number; // [-1..1]
  watchers?: number | null;
  priceClose?: number | null;
};

export type StatsResponse = {
  symbol: string;
  displayName: string;
  series: DailyPoint[];
};
