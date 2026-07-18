import { z } from 'zod';
import { contentStatusSchema, richTextBodySchema, seoFieldsSchema } from './content.js';
import { isoDateTimeSchema, slugSchema, uuidSchema } from './common.js';
import { mediaReferenceSchema } from './media.js';

export const publicPageSchema = z
  .object({
    id: uuidSchema,
    slug: slugSchema,
    title: z.string().min(1).max(220),
    summary: z.string().nullable(),
    body: richTextBodySchema,
    publishedAt: isoDateTimeSchema.nullable(),
    updatedAt: isoDateTimeSchema,
    coverMedia: mediaReferenceSchema.nullable(),
  })
  .merge(seoFieldsSchema);

export type PublicPage = z.infer<typeof publicPageSchema>;

export const editorPageSchema = publicPageSchema.extend({
  status: contentStatusSchema,
  lockVersion: z.number().int().min(1),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export type EditorPage = z.infer<typeof editorPageSchema>;

export const pageInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(220),
  summary: z.string().trim().nullable().optional(),
  body: richTextBodySchema,
  seoTitle: z.string().trim().max(70).nullable().optional(),
  metaDescription: z.string().trim().max(180).nullable().optional(),
  coverMediaId: uuidSchema.nullable().optional(),
  lockVersion: z.number().int().min(1).optional(),
  changeSummary: z.string().trim().max(500).nullable().optional(),
});

export type PageInput = z.infer<typeof pageInputSchema>;
