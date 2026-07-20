export type NewsIngestionMethod = 'AUTO' | 'RSS' | 'ATOM' | 'SITEMAP' | 'HTML' | 'MANUAL';

export type DetectedNewsStrategy =
  'RSS' | 'ATOM' | 'NEWS_SITEMAP' | 'SITEMAP' | 'JSON_LD' | 'HTML' | 'ARTICLE';

export interface NewsSourceConfig {
  key: string;
  name: string;
  domain: string;
  websiteUrl: string;
  listingUrl: string | null;
  feedUrl: string | null;
  discoveryUrl: string | null;
  detectedMethod: string | null;
  ingestionMethod: NewsIngestionMethod;
  language: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  includeUrlPatterns: string[];
  excludeUrlPatterns: string[];
  minimumRelevanceScore: number;
  maxItemsPerSync: number;
}

export interface FeedSourceConfig {
  key: string;
  name: string;
  domain: string;
  websiteUrl: string;
  feedUrl: string;
  language: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  minimumRelevanceScore: number;
  maxItemsPerSync: number;
}

export interface ParsedNewsEntry {
  externalId: string | null;
  canonicalUrl: string;
  canonicalUrlHash: string;
  title: string;
  sourceSummary: string | null;
  generatedSummary: string | null;
  summaryStatus: 'SOURCE' | 'EXTRACTIVE';
  language: string | null;
  author: string | null;
  imageUrl: string | null;
  matchedKeywords: string[];
  relevanceScore: number;
  publishedAt: Date | null;
  contentHash: string;
  rawMetadata: Record<string, unknown>;
}

export type ParsedFeedEntry = ParsedNewsEntry;

export interface FeedEvaluation {
  accepted: boolean;
  excluded: boolean;
  matchedKeywords: string[];
  relevanceScore: number;
}

export interface BaseParseResult {
  entries: ParsedNewsEntry[];
  fetched: number;
  accepted: number;
  excluded: number;
}

export type FeedParseResult = BaseParseResult;

export interface SourceParseResult extends BaseParseResult {
  strategy: DetectedNewsStrategy;
  discoveryUrl: string;
  diagnostics: string[];
}

export interface DiscoveredArticleLink {
  url: string;
  titleHint: string | null;
  imageHint: string | null;
  publishedAtHint: Date | null;
  score: number;
  discoveredBy: 'JSON_LD' | 'HTML';
}

export interface SitemapUrlEntry {
  url: string;
  titleHint: string | null;
  publishedAtHint: Date | null;
  isNewsEntry: boolean;
}

export interface SitemapParseResult {
  urls: SitemapUrlEntry[];
  childSitemaps: string[];
  isNewsSitemap: boolean;
}

export interface SourceDetectionPreview {
  strategy: DetectedNewsStrategy;
  discoveryUrl: string;
  fetched: number;
  accepted: number;
  excluded: number;
  diagnostics: string[];
  samples: Array<{
    title: string;
    canonicalUrl: string;
    publishedAt: string | null;
    relevanceScore: number;
    imageUrl: string | null;
  }>;
}
