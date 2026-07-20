import { createHash } from 'node:crypto';
import type { FeedEvaluation } from './types.js';

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;

  for (const key of ['#text', '__cdata', 'text', 'name', '@_href', '@_url']) {
    const nested = record[key];
    if (typeof nested === 'string' || typeof nested === 'number') {
      return String(nested).trim();
    }
  }

  return '';
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const parsed = Number(code);
      return Number.isInteger(parsed) ? String.fromCodePoint(parsed) : '';
    })
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isInteger(parsed) ? String.fromCodePoint(parsed) : '';
    });
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

export function truncateAtSentence(value: string, maxLength = 600): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) return normalized;

  const candidate = normalized.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
  );
  const cutAt = sentenceEnd >= Math.floor(maxLength * 0.55) ? sentenceEnd + 1 : maxLength;

  return `${candidate.slice(0, cutAt).trimEnd()}…`;
}

export function buildExtractiveSummary(value: string | null | undefined): string | null {
  if (!value) return null;

  const clean = stripHtml(value);
  return clean ? truncateAtSentence(clean) : null;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKeywords(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeSearchText(value)).filter(Boolean))];
}

export function evaluateFeedEntry(
  title: string,
  summary: string | null,
  includeKeywords: string[],
  excludeKeywords: string[],
  minimumRelevanceScore: number,
): FeedEvaluation {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedSummary = normalizeSearchText(summary ?? '');
  const combined = `${normalizedTitle} ${normalizedSummary}`.trim();
  const excludedKeywords = normalizeKeywords(excludeKeywords);

  if (excludedKeywords.some((keyword) => combined.includes(keyword))) {
    return {
      accepted: false,
      excluded: true,
      matchedKeywords: [],
      relevanceScore: 0,
    };
  }

  const acceptedKeywords = normalizeKeywords(includeKeywords);

  if (acceptedKeywords.length === 0) {
    return {
      accepted: 50 >= minimumRelevanceScore,
      excluded: false,
      matchedKeywords: [],
      relevanceScore: 50,
    };
  }

  const matchedKeywords: string[] = [];
  let score = 0;

  for (const keyword of acceptedKeywords) {
    const inTitle = normalizedTitle.includes(keyword);
    const inSummary = normalizedSummary.includes(keyword);

    if (!inTitle && !inSummary) continue;

    matchedKeywords.push(keyword);
    score += inTitle ? 35 : 0;
    score += inSummary ? 15 : 0;
  }

  const relevanceScore = Math.min(score, 100);

  return {
    accepted: relevanceScore >= minimumRelevanceScore,
    excluded: false,
    matchedKeywords,
    relevanceScore,
  };
}

export function parseDate(value: unknown): Date | null {
  const text = textValue(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
