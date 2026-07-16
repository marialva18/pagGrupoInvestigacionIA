import { z } from 'zod';
import { categorySummarySchema } from './categories.js';
import { contentStatusSchema, richTextBodySchema, seoFieldsSchema } from './content.js';
import { isoDateTimeSchema, slugSchema, uuidSchema } from './common.js';
import { externalNewsSourceTypeSchema } from './external-news.js';
import { mediaReferenceSchema } from './media.js';

export const newsOriginSchema = z.enum(['INTERNAL', 'EXTERNAL']);

export const publicNewsSourceSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(180),
  type: externalNewsSourceTypeSchema.nullable(),
  url: z.string().url().nullable(),
  originalTitle: z.string().max(300).nullable(),
  externalPublishedAt: isoDateTimeSchema.nullable(),
});

export const publicNewsSummarySchema = z.object({
  id: uuidSchema,
  slug: slugSchema,
  title: z.string().min(1).max(220),
  summary: z.string().nullable(),
  featured: z.boolean(),
  origin: newsOriginSchema,
  source: publicNewsSourceSchema,
  publishedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
  coverMedia: mediaReferenceSchema.nullable(),
  categories: z.array(categorySummarySchema),
});

export type PublicNewsSummary = z.infer<typeof publicNewsSummarySchema>;

export const publicNewsListResultSchema = z.object({
  items: z.array(publicNewsSummarySchema),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasPreviousPage: z.boolean(),
    hasNextPage: z.boolean(),
  }),
});

export type PublicNewsListResult = z.infer<typeof publicNewsListResultSchema>;

export const publicNewsDetailSchema = publicNewsSummarySchema
  .extend({
    body: richTextBodySchema,
  })
  .merge(seoFieldsSchema);

export type PublicNewsDetail = z.infer<typeof publicNewsDetailSchema>;

export const editorNewsSchema = publicNewsDetailSchema.extend({
  status: contentStatusSchema,
  lockVersion: z.number().int().min(1),
  scheduledAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export type EditorNews = z.infer<typeof editorNewsSchema>;

export const newsInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(220),
  summary: z.string().trim().nullable().optional(),
  body: richTextBodySchema,
  seoTitle: z.string().trim().max(70).nullable().optional(),
  metaDescription: z.string().trim().max(180).nullable().optional(),
  featured: z.boolean().optional(),
  coverMediaId: uuidSchema.nullable().optional(),
  categoryIds: z.array(uuidSchema).default([]),
  lockVersion: z.number().int().min(1).optional(),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  origin: newsOriginSchema.optional(),
  externalUrl: z.string().url().nullable().optional(),
  sourceName: z.string().trim().max(180).nullable().optional(),
  sourceType: externalNewsSourceTypeSchema.nullable().optional(),
  originalTitle: z.string().trim().max(300).nullable().optional(),
  externalPublishedAt: isoDateTimeSchema.nullable().optional(),
  expiresAt: isoDateTimeSchema.nullable().optional(),
});

export type NewsInput = z.infer<typeof newsInputSchema>;
