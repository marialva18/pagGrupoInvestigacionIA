import { z } from 'zod';
import { isoDateTimeSchema, slugSchema, uuidSchema } from './common.js';

export const categorySummarySchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(120),
  slug: slugSchema,
  description: z.string().nullable(),
});

export type CategorySummary = z.infer<typeof categorySummarySchema>;

export const editorCategorySchema = categorySummarySchema.extend({
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type EditorCategory = z.infer<typeof editorCategorySchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  description: z.string().trim().nullable().optional(),
  active: z.boolean().optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
