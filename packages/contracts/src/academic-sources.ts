import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';
import { mediaReferenceSchema } from './media.js';

export const academicSourceTypeSchema = z.enum([
  'DATABASE',
  'JOURNAL',
  'REPOSITORY',
  'SEARCH_ENGINE',
  'ORGANIZATION',
  'OTHER',
]);

export type AcademicSourceType = z.infer<typeof academicSourceTypeSchema>;

export const publicAcademicSourceSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(180),
  type: academicSourceTypeSchema,
  url: z.string().url(),
  description: z.string().nullable(),
  featured: z.boolean(),
  displayOrder: z.number().int(),
  logoMedia: mediaReferenceSchema.nullable(),
});

export type PublicAcademicSource = z.infer<typeof publicAcademicSourceSchema>;

export const editorAcademicSourceSchema = publicAcademicSourceSchema.extend({
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type EditorAcademicSource = z.infer<typeof editorAcademicSourceSchema>;

export const academicSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(180),
  type: academicSourceTypeSchema,
  url: z.string().trim().url(),
  description: z.string().trim().nullable().optional(),
  logoMediaId: uuidSchema.nullable().optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

export type AcademicSourceInput = z.infer<typeof academicSourceInputSchema>;
