import { XMLParser } from 'fast-xml-parser';
import { hostnameBelongsToDomain, normalizeCanonicalUrl } from '../security.js';
import { asArray, parseDate, stripHtml, textValue } from '../text.js';
import type { SitemapParseResult, SitemapUrlEntry } from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  processEntities: false,
});

function normalizeSitemapUrl(value: unknown, baseUrl: string, domain: string): string | null {
  const raw = textValue(value);
  if (!raw) return null;

  try {
    const url = normalizeCanonicalUrl(raw, baseUrl);
    return hostnameBelongsToDomain(new URL(url).hostname, domain) ? url : null;
  } catch {
    return null;
  }
}

function readNewsMetadata(record: Record<string, unknown>): {
  titleHint: string | null;
  publishedAtHint: Date | null;
  isNewsEntry: boolean;
} {
  const news = record['news:news'] as Record<string, unknown> | undefined;
  const publication = news?.['news:publication'] as Record<string, unknown> | undefined;
  const title =
    textValue(news?.['news:title']) ||
    textValue(record['image:title']) ||
    textValue(publication?.['news:name']);
  const publishedAt =
    parseDate(news?.['news:publication_date']) ??
    parseDate(record.lastmod) ??
    parseDate(record['news:publication_date']);

  return {
    titleHint: title ? stripHtml(title) : null,
    publishedAtHint: publishedAt,
    isNewsEntry: Boolean(news),
  };
}

export function parseSitemapXml(
  xml: string,
  baseUrl: string,
  sourceDomain: string,
): SitemapParseResult {
  const document = parser.parse(xml) as Record<string, unknown>;
  const urlset = document.urlset as Record<string, unknown> | undefined;
  const sitemapIndex = document.sitemapindex as Record<string, unknown> | undefined;
  const urls: SitemapUrlEntry[] = [];
  const childSitemaps: string[] = [];
  let isNewsSitemap = false;

  for (const rawEntry of asArray(urlset?.url)) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;

    const record = rawEntry as Record<string, unknown>;
    const url = normalizeSitemapUrl(record.loc, baseUrl, sourceDomain);
    if (!url) continue;

    const metadata = readNewsMetadata(record);
    isNewsSitemap ||= metadata.isNewsEntry;
    urls.push({ url, ...metadata });
  }

  for (const rawEntry of asArray(sitemapIndex?.sitemap)) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;

    const record = rawEntry as Record<string, unknown>;
    const url = normalizeSitemapUrl(record.loc, baseUrl, sourceDomain);
    if (url) childSitemaps.push(url);
  }

  if (urls.length === 0 && childSitemaps.length === 0) {
    throw new Error('El documento no contiene un sitemap reconocible.');
  }

  return {
    urls,
    childSitemaps,
    isNewsSitemap,
  };
}
