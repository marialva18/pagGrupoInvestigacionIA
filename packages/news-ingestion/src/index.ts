export {
  fetchAndParseFeed,
  fetchAndParseFeedResult,
  fetchFeedResult,
  parseFeedXml,
} from './extractors/feed.extractor.js';
export {
  discoverAlternateDiscoveryUrls,
  discoverArticleLinks,
  extractArticleFromHtml,
  htmlLooksLikeArticle,
} from './extractors/html.extractor.js';
export { parseSitemapXml } from './extractors/sitemap.extractor.js';
export { fetchPublicDocument } from './http-client.js';
export {
  assertPublicNetworkTarget,
  hostnameBelongsToDomain,
  normalizeCanonicalUrl,
  normalizeDomain,
  validateSourceUrl,
} from './security.js';
export {
  detectNewsSource,
  fetchAndParseSourceResult,
  resolveDiscoveryUrl,
} from './source-discovery.js';
export {
  buildExtractiveSummary,
  evaluateFeedEntry,
  normalizeSearchText,
  sha256,
  stripHtml,
  truncateAtSentence,
} from './text.js';
export type {
  BaseParseResult,
  DetectedNewsStrategy,
  DiscoveredArticleLink,
  FeedEvaluation,
  FeedParseResult,
  FeedSourceConfig,
  NewsIngestionMethod,
  NewsSourceConfig,
  ParsedFeedEntry,
  ParsedNewsEntry,
  SitemapParseResult,
  SitemapUrlEntry,
  SourceDetectionPreview,
  SourceParseResult,
} from './types.js';
