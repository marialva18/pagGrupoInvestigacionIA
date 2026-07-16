import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

export const externalNewsSourceTypeSchema = z.enum([
  'ACADEMIC',
  'NEWS_AGENCY',
  'NEWS_MEDIA',
  'CORPORATE_RESEARCH',
  'CORPORATE_BLOG',
  'GOVERNMENT',
  'UNIVERSITY',
  'OTHER',
]);

export const externalNewsSourceStatusSchema = z.enum(['ACTIVE', 'PAUSED']);
export const externalNewsIngestionMethodSchema = z.enum([
  'AUTO',
  'RSS',
  'ATOM',
  'SITEMAP',
  'HTML',
  'MANUAL',
]);
export const externalNewsDetectedMethodSchema = z.enum([
  'RSS',
  'ATOM',
  'NEWS_SITEMAP',
  'SITEMAP',
  'JSON_LD',
  'HTML',
  'ARTICLE',
]);
export const externalNewsReviewModeSchema = z.enum(['REQUIRED', 'AUTOMATIC']);
export const externalNewsItemStatusSchema = z.enum([
  'DISCOVERED',
  'REVIEWED',
  'IMPORTED',
  'DISCARDED',
  'FAILED',
]);
export const externalSummaryStatusSchema = z.enum([
  'SOURCE',
  'EXTRACTIVE',
  'AI_GENERATED',
  'REVIEWED',
]);

export const externalNewsSourceSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(180),
  domain: z.string().min(1).max(255),
  websiteUrl: z.string().url(),
  listingUrl: z.string().url().nullable(),
  feedUrl: z.string().url().nullable(),
  discoveryUrl: z.string().url().nullable(),
  detectedMethod: externalNewsDetectedMethodSchema.nullable(),
  type: externalNewsSourceTypeSchema,
  status: externalNewsSourceStatusSchema,
  ingestionMethod: externalNewsIngestionMethodSchema,
  reviewMode: externalNewsReviewModeSchema,
  language: z.string().min(2).max(12),
  includeKeywords: z.array(z.string()),
  excludeKeywords: z.array(z.string()),
  includeUrlPatterns: z.array(z.string()),
  excludeUrlPatterns: z.array(z.string()),
  minimumRelevanceScore: z.number().int().min(0).max(100),
  maxItemsPerSync: z.number().int().min(1).max(100),
  checkIntervalMinutes: z.number().int().min(15).max(10_080),
  nextSyncAt: isoDateTimeSchema.nullable(),
  lastSyncAt: isoDateTimeSchema.nullable(),
  lastSuccessAt: isoDateTimeSchema.nullable(),
  lastSyncStatus: z.string().nullable(),
  lastSyncMessage: z.string().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ExternalNewsSource = z.infer<typeof externalNewsSourceSchema>;

export const externalNewsSourceListSchema = z.object({
  items: z.array(externalNewsSourceSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    paused: z.number().int().nonnegative(),
  }),
});

export const externalNewsItemSourceSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(180),
  type: externalNewsSourceTypeSchema,
  websiteUrl: z.string().url(),
  reviewMode: externalNewsReviewModeSchema,
});

export const externalNewsItemSchema = z.object({
  id: uuidSchema,
  sourceKey: z.string(),
  canonicalUrl: z.string().url(),
  title: z.string(),
  sourceSummary: z.string().nullable(),
  generatedSummary: z.string().nullable(),
  summaryStatus: externalSummaryStatusSchema,
  language: z.string().nullable(),
  author: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  matchedKeywords: z.array(z.string()),
  relevanceScore: z.number().int(),
  publishedAt: isoDateTimeSchema.nullable(),
  status: externalNewsItemStatusSchema,
  firstSeenAt: isoDateTimeSchema,
  contentId: uuidSchema.nullable(),
  source: externalNewsItemSourceSchema.nullable(),
});

export type ExternalNewsItem = z.infer<typeof externalNewsItemSchema>;

export const externalNewsItemListSchema = z.object({
  items: z.array(externalNewsItemSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasPreviousPage: z.boolean(),
    hasNextPage: z.boolean(),
  }),
});

export const externalNewsSyncResultSchema = z.object({
  sourceId: uuidSchema,
  sourceName: z.string(),
  strategy: externalNewsDetectedMethodSchema,
  discoveryUrl: z.string().url(),
  fetched: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  excluded: z.number().int().nonnegative(),
  diagnostics: z.array(z.string()),
});

export const externalNewsSourceDetectionSchema = z.object({
  strategy: externalNewsDetectedMethodSchema,
  discoveryUrl: z.string().url(),
  fetched: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  excluded: z.number().int().nonnegative(),
  diagnostics: z.array(z.string()),
  samples: z.array(
    z.object({
      title: z.string(),
      canonicalUrl: z.string().url(),
      publishedAt: isoDateTimeSchema.nullable(),
      relevanceScore: z.number().int(),
      imageUrl: z.string().url().nullable(),
    }),
  ),
});

export type ExternalNewsSourceDetection = z.infer<typeof externalNewsSourceDetectionSchema>;
