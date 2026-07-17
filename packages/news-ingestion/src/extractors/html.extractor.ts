import { load, type CheerioAPI } from 'cheerio';

type CheerioSelection = ReturnType<CheerioAPI>;
import { hostnameBelongsToDomain, normalizeCanonicalUrl } from '../security.js';
import {
  buildExtractiveSummary,
  evaluateFeedEntry,
  parseDate,
  sha256,
  stripHtml,
  truncateAtSentence,
} from '../text.js';
import type { DiscoveredArticleLink, NewsSourceConfig, ParsedNewsEntry } from '../types.js';

interface JsonLdRecord extends Record<string, unknown> {
  '@type'?: unknown;
  '@graph'?: unknown;
}

const ARTICLE_TYPES = new Set([
  'Article',
  'NewsArticle',
  'BlogPosting',
  'TechArticle',
  'ScholarlyArticle',
  'Report',
]);

const HARD_EXCLUDED_PATHS =
  /\/(?:login|sign-in|signin|register|account|privacy|cookies?|terms|contact|about|author|authors|tag|tags|topic|topics|category|categories|search|newsletter|subscribe|careers?|jobs?|events?|podcasts?|videos?|webinars?)(?:\/|$)/i;
const ARTICLE_PATH_HINTS =
  /\/(?:news|article|articles|story|stories|blog|press|research|insights?|posts?|publication|technology|tecnologia)\//i;
const DATE_PATH_HINT = /\/(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2])(?:[/-](?:0?[1-9]|[12]\d|3[01]))?/;
const FILE_EXTENSION =
  /\.(?:pdf|xml|json|jpg|jpeg|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp3|mp4)(?:$|\?)/i;

function cleanText(value: string | null | undefined): string {
  return stripHtml(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonLdScripts($: CheerioAPI): JsonLdRecord[] {
  const records: JsonLdRecord[] = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      collectJsonLdRecords(parsed, records);
    } catch {
      // Algunas páginas incluyen JSON-LD parcialmente inválido. Se ignora sin romper la fuente.
    }
  });

  return records;
}

function collectJsonLdRecords(value: unknown, target: JsonLdRecord[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdRecords(item, target);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as JsonLdRecord;
  target.push(record);

  if (Array.isArray(record['@graph'])) {
    for (const item of record['@graph']) collectJsonLdRecords(item, target);
  }
}

function jsonLdTypes(record: JsonLdRecord): string[] {
  const value = record['@type'];

  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function isArticleRecord(record: JsonLdRecord): boolean {
  return jsonLdTypes(record).some((type) => ARTICLE_TYPES.has(type));
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstString(item);
      if (nested) return nested;
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    for (const key of ['url', '@id', 'contentUrl', 'name', 'headline']) {
      const nested = firstString(record[key]);
      if (nested) return nested;
    }
  }

  return null;
}

function readAuthor(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value) || null;

  const authors = Array.isArray(value) ? value : [value];
  const names: string[] = [];

  for (const author of authors) {
    if (!author || typeof author !== 'object') continue;
    const name = firstString((author as Record<string, unknown>).name);
    if (name) names.push(cleanText(name));
  }

  return names.length > 0 ? names.join(', ') : null;
}

function resolveUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;

  try {
    return normalizeCanonicalUrl(value, baseUrl);
  } catch {
    return null;
  }
}

function resolveSourceUrl(
  value: string | null,
  baseUrl: string,
  sourceDomain: string,
): string | null {
  const url = resolveUrl(value, baseUrl);
  if (!url) return null;

  return hostnameBelongsToDomain(new URL(url).hostname, sourceDomain) ? url : null;
}

function metaContent($: CheerioAPI, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = $(selector).first().attr('content');
    if (value?.trim()) return value.trim();
  }

  return null;
}

function configuredPatternMatches(value: string, pattern: string): boolean {
  const normalized = pattern.trim();
  if (!normalized) return false;

  if (normalized.startsWith('/') && normalized.lastIndexOf('/') > 0) {
    const lastSlash = normalized.lastIndexOf('/');
    const expression = normalized.slice(1, lastSlash);
    const flags = normalized.slice(lastSlash + 1).replace(/[^gimsuy]/g, '');

    try {
      return new RegExp(expression, flags).test(value);
    } catch {
      return value.toLowerCase().includes(normalized.toLowerCase());
    }
  }

  return value.toLowerCase().includes(normalized.toLowerCase());
}

function findNearbyImage(anchor: CheerioSelection, baseUrl: string): string | null {
  const container = anchor.closest('article, li, section, div');
  const image = container.find('img').first();
  const raw =
    image.attr('src') ??
    image.attr('data-src') ??
    image.attr('data-lazy-src') ??
    image.attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0] ??
    null;

  return resolveUrl(raw, baseUrl);
}

function findNearbyDate(anchor: CheerioSelection): Date | null {
  const container = anchor.closest('article, li, section, div');
  const time = container.find('time').first();
  return parseDate(time.attr('datetime') ?? time.text());
}

function addCandidate(
  map: Map<string, DiscoveredArticleLink>,
  candidate: DiscoveredArticleLink,
): void {
  const existing = map.get(candidate.url);

  if (!existing || candidate.score > existing.score) {
    map.set(candidate.url, candidate);
  }
}

function discoverJsonLdLinks(
  records: JsonLdRecord[],
  baseUrl: string,
  sourceDomain: string,
  target: Map<string, DiscoveredArticleLink>,
): void {
  for (const record of records) {
    if (isArticleRecord(record)) {
      const url = resolveSourceUrl(
        firstString(record.url) ??
          firstString(record.mainEntityOfPage) ??
          firstString(record['@id']),
        baseUrl,
        sourceDomain,
      );

      if (url) {
        addCandidate(target, {
          url,
          titleHint: firstString(record.headline) ?? firstString(record.name),
          imageHint: resolveUrl(firstString(record.image), baseUrl),
          publishedAtHint: parseDate(record.datePublished) ?? parseDate(record.dateModified),
          score: 120,
          discoveredBy: 'JSON_LD',
        });
      }
    }

    if (!jsonLdTypes(record).includes('ItemList')) continue;

    const elements = Array.isArray(record.itemListElement)
      ? record.itemListElement
      : [record.itemListElement];

    for (const element of elements) {
      if (!element) continue;

      const elementRecord =
        typeof element === 'object' ? (element as Record<string, unknown>) : null;
      const item = elementRecord?.item ?? element;
      const itemRecord =
        item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
      const rawUrl =
        firstString(itemRecord?.url) ??
        firstString(itemRecord?.['@id']) ??
        firstString(elementRecord?.url) ??
        firstString(elementRecord?.['@id']) ??
        (typeof item === 'string' ? item : null);
      const url = resolveSourceUrl(rawUrl, baseUrl, sourceDomain);

      if (!url) continue;

      addCandidate(target, {
        url,
        titleHint:
          firstString(itemRecord?.headline) ??
          firstString(itemRecord?.name) ??
          firstString(elementRecord?.name),
        imageHint: resolveUrl(firstString(itemRecord?.image), baseUrl),
        publishedAtHint:
          parseDate(itemRecord?.datePublished) ?? parseDate(elementRecord?.datePublished),
        score: 110,
        discoveredBy: 'JSON_LD',
      });
    }
  }
}

export function discoverAlternateDiscoveryUrls(
  html: string,
  baseUrl: string,
  sourceDomain: string,
): { feeds: string[]; sitemaps: string[] } {
  const $ = load(html);
  const feeds = new Set<string>();
  const sitemaps = new Set<string>();

  $('link[href]').each((_index, element) => {
    const link = $(element);
    const rel = (link.attr('rel') ?? '').toLowerCase();
    const type = (link.attr('type') ?? '').toLowerCase();
    const href = resolveSourceUrl(link.attr('href') ?? null, baseUrl, sourceDomain);

    if (!href) return;

    if (rel.includes('alternate') && (type.includes('rss') || type.includes('atom'))) {
      feeds.add(href);
    }

    if (rel.includes('sitemap') || type.includes('sitemap')) {
      sitemaps.add(href);
    }
  });

  return { feeds: [...feeds], sitemaps: [...sitemaps] };
}

export function discoverArticleLinks(
  html: string,
  baseUrl: string,
  source: NewsSourceConfig,
): DiscoveredArticleLink[] {
  const $ = load(html);
  const candidates = new Map<string, DiscoveredArticleLink>();
  const records = parseJsonLdScripts($);

  discoverJsonLdLinks(records, baseUrl, source.domain, candidates);

  $('a[href]').each((_index, element) => {
    const anchor = $(element);
    const rawHref = anchor.attr('href') ?? '';
    const url = resolveSourceUrl(rawHref, baseUrl, source.domain);

    if (!url || url === baseUrl || FILE_EXTENSION.test(url)) return;

    const text = cleanText(anchor.text() || anchor.attr('aria-label') || anchor.attr('title'));
    const path = new URL(url).pathname;

    if (HARD_EXCLUDED_PATHS.test(path)) return;
    if (source.excludeUrlPatterns.some((pattern) => configuredPatternMatches(url, pattern))) return;

    let score = 0;
    const segmentCount = path.split('/').filter(Boolean).length;

    if (text.length >= 18 && text.length <= 240) score += 24;
    if (segmentCount >= 2) score += 10;
    if (segmentCount >= 3) score += 8;
    if (ARTICLE_PATH_HINTS.test(path)) score += 24;
    if (DATE_PATH_HINT.test(path)) score += 20;
    if (anchor.closest('article').length > 0) score += 30;
    if (anchor.closest('main').length > 0) score += 8;
    if (anchor.is('h1 a, h2 a, h3 a') || anchor.find('h1, h2, h3').length > 0) score += 18;

    const imageHint = findNearbyImage(anchor, baseUrl);
    if (imageHint) score += 8;

    const includeMatch = source.includeUrlPatterns.some((pattern) =>
      configuredPatternMatches(url, pattern),
    );

    if (source.includeUrlPatterns.length > 0) {
      score += includeMatch ? 30 : -12;
    }

    if (/\/(?:page|pagina)\/\d+\/?$/i.test(path)) score -= 35;
    if (/\.(?:html?|aspx?)$/i.test(path)) score += 8;
    if (!text) score -= 25;

    if (score < 35) return;

    addCandidate(candidates, {
      url,
      titleHint: text || null,
      imageHint,
      publishedAtHint: findNearbyDate(anchor),
      score,
      discoveredBy: 'HTML',
    });
  });

  return [...candidates.values()].sort((a, b) => b.score - a.score);
}

function findArticleRecord(records: JsonLdRecord[]): JsonLdRecord | null {
  return records.find(isArticleRecord) ?? null;
}

export function extractArticleFromHtml(
  html: string,
  requestedUrl: string,
  source: NewsSourceConfig,
  hint: DiscoveredArticleLink | null = null,
): ParsedNewsEntry | null {
  const $ = load(html);
  const records = parseJsonLdScripts($);
  const article = findArticleRecord(records);
  const canonicalUrl = resolveSourceUrl(
    firstString(article?.url) ??
      firstString(article?.mainEntityOfPage) ??
      $('link[rel="canonical"]').first().attr('href') ??
      metaContent($, ['meta[property="og:url"]']) ??
      requestedUrl,
    requestedUrl,
    source.domain,
  );

  if (!canonicalUrl) return null;

  const title = cleanText(
    firstString(article?.headline) ??
      firstString(article?.name) ??
      metaContent($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
      $('main h1, article h1, h1').first().text() ??
      $('title').first().text() ??
      hint?.titleHint ??
      '',
  );

  if (title.length < 8) return null;

  const sourceSummary =
    cleanText(
      firstString(article?.description) ??
        metaContent($, [
          'meta[property="og:description"]',
          'meta[name="twitter:description"]',
          'meta[name="description"]',
        ]) ??
        $('article p, main p')
          .filter((_index, element) => cleanText($(element).text()).length >= 50)
          .first()
          .text() ??
        '',
    ) || null;
  const generatedSummary = buildExtractiveSummary(sourceSummary);
  const evaluation = evaluateFeedEntry(
    title,
    generatedSummary,
    source.includeKeywords,
    source.excludeKeywords,
    source.minimumRelevanceScore,
  );

  if (!evaluation.accepted) return null;

  const rawImage =
    firstString(article?.image) ??
    metaContent($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]) ??
    $('article img, main img').first().attr('src') ??
    hint?.imageHint ??
    null;
  const imageUrl = resolveUrl(rawImage, requestedUrl);
  const publishedAt =
    parseDate(article?.datePublished) ??
    parseDate(metaContent($, ['meta[property="article:published_time"]'])) ??
    parseDate($('article time, main time, time').first().attr('datetime')) ??
    hint?.publishedAtHint ??
    null;
  const author =
    readAuthor(article?.author) ??
    (cleanText(
      metaContent($, ['meta[name="author"]', 'meta[property="article:author"]']) ??
        $('[rel="author"], .author, [class*="author"]').first().text(),
    ) ||
      null);
  const extractionMethod = article
    ? 'JSON_LD'
    : metaContent($, ['meta[property="og:type"]']) === 'article'
      ? 'OPEN_GRAPH'
      : 'HTML';

  return {
    externalId: canonicalUrl,
    canonicalUrl,
    canonicalUrlHash: sha256(canonicalUrl),
    title: truncateAtSentence(title, 300),
    sourceSummary,
    generatedSummary,
    summaryStatus: generatedSummary ? 'EXTRACTIVE' : 'SOURCE',
    language: $('html').attr('lang')?.split('-')[0]?.toLowerCase() ?? source.language ?? null,
    author: author ? truncateAtSentence(author, 220) : null,
    imageUrl,
    matchedKeywords: evaluation.matchedKeywords,
    relevanceScore: evaluation.relevanceScore,
    publishedAt,
    contentHash: sha256(`${title}\n${sourceSummary ?? ''}`),
    rawMetadata: {
      extractionMethod,
      discoveryScore: hint?.score ?? null,
      discoveredBy: hint?.discoveredBy ?? (article ? 'JSON_LD' : 'ARTICLE'),
      requestedUrl,
    },
  };
}

export function htmlLooksLikeArticle(html: string): boolean {
  const $ = load(html);
  const records = parseJsonLdScripts($);

  return (
    records.some(isArticleRecord) ||
    metaContent($, ['meta[property="og:type"]'])?.toLowerCase() === 'article' ||
    $('article h1, main h1').length > 0
  );
}
