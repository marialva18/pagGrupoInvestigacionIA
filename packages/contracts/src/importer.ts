import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

export const externalNewsStatusSchema = z.enum([
  'DISCOVERED',
  'REVIEWED',
  'IMPORTED',
  'DISCARDED',
  'FAILED',
]);

export type ExternalNewsStatus = z.infer<typeof externalNewsStatusSchema>;

export const externalNewsCandidateSchema = z.object({
  id: uuidSchema,
  sourceKey: z.string().min(1).max(100),
  externalId: z.string().max(255).nullable(),
  canonicalUrl: z.string().url(),
  title: z.string().min(1).max(300),
  summary: z.string().nullable(),
  publishedAt: isoDateTimeSchema.nullable(),
  contentHash: z.string().length(64).nullable(),
  status: externalNewsStatusSchema,
  contentId: uuidSchema.nullable(),
  firstSeenAt: isoDateTimeSchema,
  importedAt: isoDateTimeSchema.nullable(),
});

export type ExternalNewsCandidate = z.infer<typeof externalNewsCandidateSchema>;

export const externalNewsPreviewRequestSchema = z.object({
  sourceKey: z.string().min(1).max(100),
});

export type ExternalNewsPreviewRequest = z.infer<typeof externalNewsPreviewRequestSchema>;

export const externalNewsImportRequestSchema = z.object({
  candidateId: uuidSchema,
});

export type ExternalNewsImportRequest = z.infer<typeof externalNewsImportRequestSchema>;
