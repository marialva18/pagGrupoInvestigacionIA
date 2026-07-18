import { slugSchema } from '@intgarti/contracts';
import { z } from 'zod';

const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const publicNewsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  pageSize: z.coerce.number().int().min(1).max(50).default(12),

  q: z.string().trim().min(1).max(120).optional(),

  category: slugSchema.optional(),

  featured: booleanQuerySchema.optional(),
});

export const publicNewsSlugParamsSchema = z.object({
  slug: slugSchema,
});

export type PublicNewsListInput = z.infer<typeof publicNewsListQuerySchema>;
