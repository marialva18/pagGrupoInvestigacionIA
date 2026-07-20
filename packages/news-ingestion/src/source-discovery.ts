import {
  documentLooksLikeHtml,
  documentLooksLikeXml,
  fetchPublicDocument,
  type FetchedDocument,
} from './http-client.js';
import { fetchFeedResult, parseFeedXml } from './extractors/feed.extractor.js';
import {
  discoverAlternateDiscoveryUrls,
  discoverArticleLinks,
  extractArticleFromHtml,
  htmlLooksLikeArticle,
} from './extractors/html.extractor.js';
import { parseSitemapXml } from './extractors/sitemap.extractor.js';
import { hostnameBelongsToDomain, normalizeCanonicalUrl, validateSourceUrl } from './security.js';
import type {
  DiscoveredArticleLink,
  NewsSourceConfig,
  ParsedNewsEntry,
  SitemapUrlEntry,
  SourceDetectionPreview,
  SourceParseResult,
} from './types.js';

interface DiscoveryAttemptError {
  url: string;
  message: string;
}

function formatAttemptError(error: DiscoveryAttemptError): string {
  return `${error.url}: ${error.message}`;
}

function addUniqueUrl(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function safeSourceUrl(value: string, source: NewsSourceConfig): string | null {
  try {
    const url = validateSourceUrl(value);
    return hostnameBelongsToDomain(url.hostname, source.domain) ? url.toString() : null;
  } catch {
    return null;
  }
}

function commonDiscoveryCandidates(source: NewsSourceConfig): string[] {
  const listing = new URL(source.listingUrl ?? source.websiteUrl);
  const origin = listing.origin;
  const directoryPath = listing.pathname.endsWith('/')
    ? listing.pathname
    : `${listing.pathname.replace(/[^/]+$/, '')}`;
  const candidates = [
    new URL('/feed/', origin).toString(),
    new URL('/rss.xml', origin).toString(),
    new URL('/feed.xml', origin).toString(),
    new URL('/atom.xml', origin).toString(),
    new URL('/news-sitemap.xml', origin).toString(),
    new URL('/sitemap.xml', origin).toString(),
  ];

  if (directoryPath && directoryPath !== '/') {
    candidates.unshift(
      new URL(`${directoryPath}feed/`, origin).toString(),
      new URL(`${directoryPath}rss/`, origin).toString(),
    );
  }

  return [...new Set(candidates)].filter((candidate) => safeSourceUrl(candidate, source));
}

async function discoverRobotsSitemaps(source: NewsSourceConfig): Promise<string[]> {
  const origin = new URL(source.listingUrl ?? source.websiteUrl).origin;
  const robotsUrl = new URL('/robots.txt', origin).toString();

  try {
    const document = await fetchPublicDocument(robotsUrl, source.domain, {
      accept: 'text/plain;q=1.0, text/*;q=0.8',
      maxBytes: 300_000,
      timeoutMs: 8_000,
    });
    const urls: string[] = [];

    for (const line of document.body.split(/\r?\n/)) {
      const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
      if (!match?.[1]) continue;

      const normalized = safeSourceUrl(match[1], source);
      if (normalized) addUniqueUrl(urls, normalized);
    }

    return urls.slice(0, 6);
  } catch {
    return [];
  }
}

async function extractArticlesFromLinks(
  source: NewsSourceConfig,
  links: DiscoveredArticleLink[],
  diagnostics: string[],
): Promise<{ entries: ParsedNewsEntry[]; fetched: number; excluded: number }> {
  const unique = new Map<string, ParsedNewsEntry>();
  const candidateLimit = Math.min(Math.max(source.maxItemsPerSync * 2, 12), 30);
  const candidates = links.slice(0, candidateLimit);
  let excluded = 0;

  for (const candidate of candidates) {
    if (unique.size >= source.maxItemsPerSync) break;

    try {
      const document = await fetchPublicDocument(candidate.url, source.domain, {
        accept: 'text/html, application/xhtml+xml;q=0.9',
        maxBytes: 2_500_000,
      });

      if (!documentLooksLikeHtml(document)) {
        excluded += 1;
        continue;
      }

      const entry = extractArticleFromHtml(document.body, document.finalUrl, source, candidate);

      if (!entry || unique.has(entry.canonicalUrlHash)) {
        excluded += 1;
        continue;
      }

      unique.set(entry.canonicalUrlHash, entry);
    } catch (error: unknown) {
      excluded += 1;
      diagnostics.push(
        `No se pudo extraer ${candidate.url}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }

  return {
    entries: [...unique.values()],
    fetched: candidates.length,
    excluded,
  };
}

function sitemapLinksToDiscoveredLinks(entries: SitemapUrlEntry[]): DiscoveredArticleLink[] {
  return entries.map((entry) => ({
    url: entry.url,
    titleHint: entry.titleHint,
    imageHint: null,
    publishedAtHint: entry.publishedAtHint,
    score: entry.isNewsEntry ? 120 : 75,
    discoveredBy: 'JSON_LD',
  }));
}

async function processSitemap(
  source: NewsSourceConfig,
  initialDocument: FetchedDocument,
  diagnostics: string[],
): Promise<SourceParseResult> {
  const pending: Array<{ url: string; body: string | null }> = [
    { url: initialDocument.finalUrl, body: initialDocument.body },
  ];
  const visited = new Set<string>();
  const collected = new Map<string, SitemapUrlEntry>();
  let newsSitemap = false;

  while (pending.length > 0 && visited.size < 5 && collected.size < 120) {
    const current = pending.shift();
    if (!current || visited.has(current.url)) continue;
    visited.add(current.url);

    try {
      const body =
        current.body ??
        (
          await fetchPublicDocument(current.url, source.domain, {
            accept: 'application/xml, text/xml;q=0.9',
            maxBytes: 4_000_000,
          })
        ).body;
      const parsed = parseSitemapXml(body, current.url, source.domain);
      newsSitemap ||= parsed.isNewsSitemap;

      for (const entry of parsed.urls) {
        if (!collected.has(entry.url)) collected.set(entry.url, entry);
      }

      for (const child of parsed.childSitemaps.slice(0, 4)) {
        if (!visited.has(child)) pending.push({ url: child, body: null });
      }
    } catch (error: unknown) {
      diagnostics.push(
        `Sitemap ${current.url}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }

  if (collected.size === 0) {
    throw new Error('No se encontraron URLs de artículos en el sitemap.');
  }

  const links = sitemapLinksToDiscoveredLinks([...collected.values()]);
  const extracted = await extractArticlesFromLinks(source, links, diagnostics);

  return {
    ...extracted,
    accepted: extracted.entries.length,
    strategy: newsSitemap ? 'NEWS_SITEMAP' : 'SITEMAP',
    discoveryUrl: initialDocument.finalUrl,
    diagnostics,
  };
}

async function processHtml(
  source: NewsSourceConfig,
  document: FetchedDocument,
  diagnostics: string[],
): Promise<SourceParseResult> {
  if (htmlLooksLikeArticle(document.body)) {
    const entry = extractArticleFromHtml(document.body, document.finalUrl, source);

    if (entry) {
      return {
        entries: [entry],
        fetched: 1,
        accepted: 1,
        excluded: 0,
        strategy: 'ARTICLE',
        discoveryUrl: document.finalUrl,
        diagnostics,
      };
    }
  }

  const links = discoverArticleLinks(document.body, document.finalUrl, source);

  if (links.length === 0) {
    throw new Error('No se detectaron enlaces que parezcan artículos en la página.');
  }

  const extracted = await extractArticlesFromLinks(source, links, diagnostics);
  const jsonLdCount = links.filter((link) => link.discoveredBy === 'JSON_LD').length;

  return {
    ...extracted,
    accepted: extracted.entries.length,
    strategy: jsonLdCount > 0 ? 'JSON_LD' : 'HTML',
    discoveryUrl: document.finalUrl,
    diagnostics,
  };
}

async function processDocument(
  source: NewsSourceConfig,
  document: FetchedDocument,
  diagnostics: string[],
): Promise<SourceParseResult> {
  if (documentLooksLikeXml(document)) {
    try {
      const feed = parseFeedXml(document.body, {
        key: source.key,
        name: source.name,
        domain: source.domain,
        websiteUrl: source.websiteUrl,
        feedUrl: document.finalUrl,
        language: source.language,
        includeKeywords: source.includeKeywords,
        excludeKeywords: source.excludeKeywords,
        minimumRelevanceScore: source.minimumRelevanceScore,
        maxItemsPerSync: source.maxItemsPerSync,
      });

      return {
        entries: feed.entries,
        fetched: feed.fetched,
        accepted: feed.accepted,
        excluded: feed.excluded,
        strategy: feed.strategy,
        discoveryUrl: document.finalUrl,
        diagnostics,
      };
    } catch (feedError: unknown) {
      diagnostics.push(
        `No era RSS/Atom: ${feedError instanceof Error ? feedError.message : 'formato inválido'}`,
      );
    }

    return processSitemap(source, document, diagnostics);
  }

  if (documentLooksLikeHtml(document)) {
    return processHtml(source, document, diagnostics);
  }

  throw new Error(`Tipo de documento no compatible: ${document.contentType || 'desconocido'}.`);
}

async function attemptUrl(
  source: NewsSourceConfig,
  url: string,
  diagnostics: string[],
): Promise<SourceParseResult> {
  const document = await fetchPublicDocument(url, source.domain, {
    maxBytes: 4_000_000,
  });

  return processDocument(source, document, diagnostics);
}

async function attemptCandidates(
  source: NewsSourceConfig,
  urls: string[],
  diagnostics: string[],
  attempts: DiscoveryAttemptError[],
): Promise<SourceParseResult | null> {
  for (const url of urls) {
    try {
      return await attemptUrl(source, url, diagnostics);
    } catch (error: unknown) {
      attempts.push({
        url,
        message: error instanceof Error ? error.message : 'error desconocido',
      });
    }
  }

  return null;
}

function preferredTechnicalUrls(source: NewsSourceConfig): string[] {
  const urls: string[] = [];

  for (const value of [source.discoveryUrl, source.feedUrl]) {
    if (!value) continue;
    const normalized = safeSourceUrl(value, source);
    if (normalized) addUniqueUrl(urls, normalized);
  }

  return urls;
}

export async function fetchAndParseSourceResult(
  source: NewsSourceConfig,
): Promise<SourceParseResult> {
  if (source.ingestionMethod === 'MANUAL') {
    throw new Error('La fuente está configurada para carga manual.');
  }

  const diagnostics: string[] = [];
  const attempts: DiscoveryAttemptError[] = [];
  const technicalUrls = preferredTechnicalUrls(source);

  if (source.ingestionMethod === 'RSS' || source.ingestionMethod === 'ATOM') {
    const target = technicalUrls[0];
    if (!target) throw new Error('La fuente RSS o Atom no tiene una URL técnica configurada.');

    const result = await fetchFeedResult(source, target);
    return { ...result, diagnostics };
  }

  if (source.ingestionMethod === 'SITEMAP') {
    const target = technicalUrls[0] ?? source.listingUrl ?? source.websiteUrl;
    const document = await fetchPublicDocument(target, source.domain, {
      accept: 'application/xml, text/xml;q=0.9',
      maxBytes: 4_000_000,
    });
    return processSitemap(source, document, diagnostics);
  }

  if (source.ingestionMethod === 'HTML') {
    const target = source.listingUrl ?? source.websiteUrl;
    const document = await fetchPublicDocument(target, source.domain, {
      accept: 'text/html, application/xhtml+xml;q=0.9',
      maxBytes: 4_000_000,
    });
    return processHtml(source, document, diagnostics);
  }

  const remembered = await attemptCandidates(source, technicalUrls, diagnostics, attempts);
  if (remembered) return remembered;

  const listingUrl = safeSourceUrl(source.listingUrl ?? source.websiteUrl, source);
  if (!listingUrl) throw new Error('La URL de noticias no pertenece al dominio aprobado.');

  let listingDocument: FetchedDocument;

  try {
    listingDocument = await fetchPublicDocument(listingUrl, source.domain, {
      maxBytes: 4_000_000,
    });
  } catch (error: unknown) {
    attempts.push({
      url: listingUrl,
      message: error instanceof Error ? error.message : 'error desconocido',
    });
    throw new Error(
      `No fue posible abrir la página configurada. ${attempts.map(formatAttemptError).join(' | ')}`,
      { cause: error },
    );
  }

  if (documentLooksLikeXml(listingDocument)) {
    try {
      return await processDocument(source, listingDocument, diagnostics);
    } catch (error: unknown) {
      attempts.push({
        url: listingDocument.finalUrl,
        message: error instanceof Error ? error.message : 'formato XML desconocido',
      });
    }
  }

  if (documentLooksLikeHtml(listingDocument)) {
    const alternate = discoverAlternateDiscoveryUrls(
      listingDocument.body,
      listingDocument.finalUrl,
      source.domain,
    );
    const robotsSitemaps = await discoverRobotsSitemaps(source);
    const discoveredTechnicalUrls = [...alternate.feeds, ...alternate.sitemaps, ...robotsSitemaps];
    const technical = await attemptCandidates(
      source,
      discoveredTechnicalUrls.slice(0, 8),
      diagnostics,
      attempts,
    );

    if (technical) return technical;

    try {
      const htmlResult = await processHtml(source, listingDocument, diagnostics);
      if (htmlResult.fetched > 0) return htmlResult;
    } catch (error: unknown) {
      attempts.push({
        url: listingDocument.finalUrl,
        message: error instanceof Error ? error.message : 'no se detectaron artículos',
      });
    }
  }

  const conventional = await attemptCandidates(
    source,
    commonDiscoveryCandidates(source).slice(0, 8),
    diagnostics,
    attempts,
  );

  if (conventional) return conventional;

  const detail = attempts.slice(-8).map(formatAttemptError).join(' | ');
  throw new Error(`No se pudo detectar RSS, Atom, sitemap ni artículos HTML. ${detail}`.trim());
}

export async function detectNewsSource(source: NewsSourceConfig): Promise<SourceDetectionPreview> {
  const previewSource: NewsSourceConfig = {
    ...source,
    maxItemsPerSync: Math.min(source.maxItemsPerSync, 5),
  };
  const result = await fetchAndParseSourceResult(previewSource);

  return {
    strategy: result.strategy,
    discoveryUrl: result.discoveryUrl,
    fetched: result.fetched,
    accepted: result.accepted,
    excluded: result.excluded,
    diagnostics: result.diagnostics.slice(0, 12),
    samples: result.entries.slice(0, 5).map((entry) => ({
      title: entry.title,
      canonicalUrl: entry.canonicalUrl,
      publishedAt: entry.publishedAt?.toISOString() ?? null,
      relevanceScore: entry.relevanceScore,
      imageUrl: entry.imageUrl,
    })),
  };
}

export function resolveDiscoveryUrl(value: string, baseUrl: string): string {
  return normalizeCanonicalUrl(value, baseUrl);
}
