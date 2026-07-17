import { XMLParser } from 'fast-xml-parser';
import { fetchPublicDocument } from '../http-client.js';
import { hostnameBelongsToDomain, normalizeCanonicalUrl } from '../security.js';
import {
  asArray,
  buildExtractiveSummary,
  evaluateFeedEntry,
  parseDate,
  sha256,
  stripHtml,
  textValue,
  truncateAtSentence,
} from '../text.js';
import type {
  DetectedNewsStrategy,
  FeedParseResult,
  FeedSourceConfig,
  NewsSourceConfig,
  ParsedNewsEntry,
} from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  processEntities: false,
});

function getAtomLink(entry: Record<string, unknown>): string {
  for (const candidate of asArray(entry.link)) {
    if (typeof candidate === 'string') return candidate;
    if (!candidate || typeof candidate !== 'object') continue;

    const link = candidate as Record<string, unknown>;
    const href = textValue(link['@_href']);
    const rel = textValue(link['@_rel']);

    if (href && (!rel || rel === 'alternate')) return href;
  }

  return '';
}

function getImageUrl(entry: Record<string, unknown>): string | null {
  const candidates = [
    entry.enclosure,
    entry['media:content'],
    entry['media:thumbnail'],
    entry.image,
  ];

  for (const value of candidates) {
    for (const candidate of asArray(value)) {
      if (typeof candidate === 'string') return candidate;
      if (!candidate || typeof candidate !== 'object') continue;

      const record = candidate as Record<string, unknown>;
      const url = textValue(record['@_url']) || textValue(record.url) || textValue(record.link);
      const type = textValue(record['@_type']);

      if (url && (!type || type.startsWith('image/'))) return url;
    }
  }

  return null;
}

function parseFeedEntries(document: Record<string, unknown>): {
  entries: Record<string, unknown>[];
  strategy: DetectedNewsStrategy;
} {
  const rss = document.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;

  if (channel?.item) {
    return {
      entries: asArray(channel.item).filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      ),
      strategy: 'RSS',
    };
  }

  const feed = document.feed as Record<string, unknown> | undefined;

  if (feed?.entry) {
    return {
      entries: asArray(feed.entry).filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      ),
      strategy: 'ATOM',
    };
  }

  const rdf = document['rdf:RDF'] as Record<string, unknown> | undefined;

  if (rdf?.item) {
    return {
      entries: asArray(rdf.item).filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      ),
      strategy: 'RSS',
    };
  }

  if (document.channel && document.item) {
    return {
      entries: asArray(document.item).filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object'),
      ),
      strategy: 'RSS',
    };
  }

  throw new Error('El documento no contiene elementos RSS o Atom reconocibles.');
}

function toFeedConfig(source: NewsSourceConfig, feedUrl: string): FeedSourceConfig {
  return {
    key: source.key,
    name: source.name,
    domain: source.domain,
    websiteUrl: source.websiteUrl,
    feedUrl,
    language: source.language,
    includeKeywords: source.includeKeywords,
    excludeKeywords: source.excludeKeywords,
    minimumRelevanceScore: source.minimumRelevanceScore,
    maxItemsPerSync: source.maxItemsPerSync,
  };
}

function mapFeedEntry(
  entry: Record<string, unknown>,
  source: FeedSourceConfig,
): ParsedNewsEntry | null {
  const title = stripHtml(textValue(entry.title));
  const rawLink = textValue(entry.link) || getAtomLink(entry);

  if (!title || !rawLink) return null;

  let canonicalUrl: string;

  try {
    canonicalUrl = normalizeCanonicalUrl(rawLink, source.websiteUrl);

    if (!hostnameBelongsToDomain(new URL(canonicalUrl).hostname, source.domain)) {
      return null;
    }
  } catch {
    return null;
  }

  const rawSummary =
    textValue(entry.description) ||
    textValue(entry.summary) ||
    textValue(entry['content:encoded']) ||
    textValue(entry.content) ||
    textValue(entry['media:description']);
  const sourceSummary = rawSummary ? stripHtml(rawSummary) : null;
  const generatedSummary = buildExtractiveSummary(sourceSummary);
  const evaluation = evaluateFeedEntry(
    title,
    generatedSummary,
    source.includeKeywords,
    source.excludeKeywords,
    source.minimumRelevanceScore,
  );

  if (!evaluation.accepted) return null;

  const publishedAt =
    parseDate(entry.pubDate) ??
    parseDate(entry.published) ??
    parseDate(entry.updated) ??
    parseDate(entry.date) ??
    parseDate(entry['dc:date']);
  const externalId =
    textValue(entry.guid) || textValue(entry.id) || textValue(entry['dc:identifier']) || null;
  const author =
    textValue(entry.author) || textValue(entry['dc:creator']) || textValue(entry.creator) || null;
  let imageUrl: string | null = null;
  const rawImage = getImageUrl(entry);

  if (rawImage) {
    try {
      imageUrl = normalizeCanonicalUrl(rawImage, source.websiteUrl);
    } catch {
      imageUrl = null;
    }
  }

  return {
    externalId,
    canonicalUrl,
    canonicalUrlHash: sha256(canonicalUrl),
    title: truncateAtSentence(title, 300),
    sourceSummary,
    generatedSummary,
    summaryStatus: generatedSummary ? 'EXTRACTIVE' : 'SOURCE',
    language: source.language || null,
    author: author ? truncateAtSentence(author, 220) : null,
    imageUrl,
    matchedKeywords: evaluation.matchedKeywords,
    relevanceScore: evaluation.relevanceScore,
    publishedAt,
    contentHash: sha256(`${title}\n${sourceSummary ?? ''}`),
    rawMetadata: {
      extractionMethod: 'FEED',
      externalId,
      originalLink: rawLink,
      fetchedTitle: title,
    },
  };
}

export function parseFeedXml(
  xml: string,
  source: FeedSourceConfig,
): FeedParseResult & { strategy: DetectedNewsStrategy } {
  const document = parser.parse(xml) as Record<string, unknown>;
  const parsed = parseFeedEntries(document);
  const unique = new Map<string, ParsedNewsEntry>();
  let excluded = 0;
  const candidates = parsed.entries.slice(0, Math.max(source.maxItemsPerSync * 3, 30));

  for (const entry of candidates) {
    const mapped = mapFeedEntry(entry, source);

    if (!mapped || unique.has(mapped.canonicalUrlHash)) {
      excluded += 1;
      continue;
    }

    unique.set(mapped.canonicalUrlHash, mapped);

    if (unique.size >= source.maxItemsPerSync) break;
  }

  const entries = [...unique.values()];

  return {
    entries,
    fetched: candidates.length,
    accepted: entries.length,
    excluded,
    strategy: parsed.strategy,
  };
}

export async function fetchFeedResult(
  source: NewsSourceConfig,
  feedUrl: string,
): Promise<FeedParseResult & { strategy: DetectedNewsStrategy; discoveryUrl: string }> {
  const document = await fetchPublicDocument(feedUrl, source.domain, {
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
    maxBytes: 2_000_000,
  });
  const parsed = parseFeedXml(document.body, toFeedConfig(source, document.finalUrl));

  return {
    ...parsed,
    discoveryUrl: document.finalUrl,
  };
}

export async function fetchAndParseFeedResult(source: FeedSourceConfig): Promise<FeedParseResult> {
  const adapted: NewsSourceConfig = {
    ...source,
    listingUrl: source.websiteUrl,
    discoveryUrl: source.feedUrl,
    detectedMethod: null,
    ingestionMethod: 'RSS',
    includeUrlPatterns: [],
    excludeUrlPatterns: [],
  };
  const result = await fetchFeedResult(adapted, source.feedUrl);

  return {
    entries: result.entries,
    fetched: result.fetched,
    accepted: result.accepted,
    excluded: result.excluded,
  };
}

export async function fetchAndParseFeed(source: FeedSourceConfig): Promise<ParsedNewsEntry[]> {
  return (await fetchAndParseFeedResult(source)).entries;
}
