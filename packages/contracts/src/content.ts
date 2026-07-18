import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

export const contentTypeSchema = z.enum(['NEWS', 'PAGE', 'EVENT']);

export type ContentType = z.infer<typeof contentTypeSchema>;

export const contentStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);

export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const revisionStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHED',
  'SUPERSEDED',
  'ARCHIVED',
]);

export type RevisionStatus = z.infer<typeof revisionStatusSchema>;

export const tiptapMarkSchema = z
  .object({
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();

export const tiptapNodeSchema = z
  .object({
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).nullable().optional(),
    content: z.array(z.unknown()).optional(),
    marks: z.array(tiptapMarkSchema).optional(),
    text: z.string().optional(),
  })
  .passthrough();

export const tiptapDocumentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(tiptapNodeSchema).default([]),
  })
  .passthrough();

export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>;

export const richTextBodySchema = z.object({
  schemaVersion: z.literal(1),
  editor: z.literal('tiptap'),
  document: tiptapDocumentSchema,
});

export type RichTextBody = z.infer<typeof richTextBodySchema>;

export const seoFieldsSchema = z.object({
  seoTitle: z.string().max(70).nullable(),
  metaDescription: z.string().max(180).nullable(),
});

export type SeoFields = z.infer<typeof seoFieldsSchema>;

export const contentRevisionSummarySchema = z.object({
  id: uuidSchema,
  contentId: uuidSchema,
  version: z.number().int().min(1),
  status: revisionStatusSchema,
  sourceLockVersion: z.number().int().min(1),
  changeSummary: z.string().max(500).nullable(),
  createdAt: isoDateTimeSchema,
  publishedAt: isoDateTimeSchema.nullable(),
});

export type ContentRevisionSummary = z.infer<typeof contentRevisionSummarySchema>;
