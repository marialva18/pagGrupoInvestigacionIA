import { z } from 'zod';

const newsBlockSchema = z.object({
  type: z.string().trim().min(1).max(50),
  data: z.record(z.string(), z.any()).default({}),
});

export const createNewsSchema = z.object({
  title: z.string().trim().min(5).max(220),

  slug: z
    .string()
    .trim()
    .min(3)
    .max(180)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'El slug debe contener letras minúsculas, números y guiones.',
    )
    .optional(),

  summary: z.string().trim().min(20).max(600),

  body: z.object({
    version: z.number().int().positive().default(1),
    blocks: z.array(newsBlockSchema).max(500),
  }),

  categoryIds: z
    .array(z.string().uuid())
    .min(1)
    .max(5)
    .refine((categoryIds) => new Set(categoryIds).size === categoryIds.length, {
      message: 'Las categorías no pueden repetirse.',
    }),

  coverMediaId: z.string().uuid(),

  seoTitle: z.string().trim().min(5).max(70).optional(),

  metaDescription: z.string().trim().min(20).max(180).optional(),
});

export const listNewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  pageSize: z.coerce.number().int().min(1).max(100).default(20),

  q: z.string().trim().min(2).max(120).optional(),

  status: z
    .enum([
      'DRAFT',
      'IN_REVIEW',
      'CHANGES_REQUESTED',
      'APPROVED',
      'SCHEDULED',
      'PUBLISHED',
      'ARCHIVED',
    ])
    .optional(),

  categoryId: z.string().uuid().optional(),
});

export type CreateNewsInput = z.infer<typeof createNewsSchema>;

export type ListNewsInput = z.infer<typeof listNewsQuerySchema>;

export const newsIdParamsSchema = z.object({
  newsId: z.string().uuid(),
});
