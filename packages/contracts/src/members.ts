import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';
import { mediaReferenceSchema } from './media.js';

export const publicMemberSchema = z.object({
  id: uuidSchema,
  fullName: z.string().min(1).max(180),
  roleTitle: z.string().min(1).max(180),
  biography: z.string().nullable(),
  email: z.string().email().nullable(),
  linkedinUrl: z.string().url().nullable(),
  orcidUrl: z.string().url().nullable(),
  isCoordinator: z.boolean(),
  displayOrder: z.number().int(),
  photoMedia: mediaReferenceSchema.nullable(),
});

export type PublicMember = z.infer<typeof publicMemberSchema>;

export const editorMemberSchema = publicMemberSchema.extend({
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type EditorMember = z.infer<typeof editorMemberSchema>;

export const memberInputSchema = z.object({
  fullName: z.string().trim().min(1).max(180),
  roleTitle: z.string().trim().min(1).max(180),
  biography: z.string().trim().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  linkedinUrl: z.string().trim().url().nullable().optional(),
  orcidUrl: z.string().trim().url().nullable().optional(),
  photoMediaId: uuidSchema.nullable().optional(),
  isCoordinator: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export type MemberInput = z.infer<typeof memberInputSchema>;
