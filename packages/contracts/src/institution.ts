import { z } from 'zod';
import { mediaReferenceSchema } from './media.js';

export const researchLineSchema = z.object({
  code: z.string().max(40),
  name: z.string().min(1).max(180),
});
export const researchProjectSchema = z.object({
  code: z.string().max(60),
  title: z.string().min(1).max(500),
});

export const institutionProfileInputSchema = z.object({
  introduction: z.string().min(1).max(6000),
  objectives: z.string().min(1).max(6000),
  services: z.array(z.string().min(1).max(500)).max(30),
  email: z.string().email(),
  phone: z.string().max(80),
  office: z.string().max(300),
  researchLines: z.array(researchLineSchema).max(30),
  projects: z.array(researchProjectSchema).max(100),
  heroMediaId: z.string().uuid().nullable(),
  groupMediaId: z.string().uuid().nullable(),
});

export const institutionProfileSchema = institutionProfileInputSchema.extend({
  heroMedia: mediaReferenceSchema.nullable(),
  groupMedia: mediaReferenceSchema.nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
});

export type InstitutionProfileInput = z.infer<typeof institutionProfileInputSchema>;
export type InstitutionProfile = z.infer<typeof institutionProfileSchema>;
