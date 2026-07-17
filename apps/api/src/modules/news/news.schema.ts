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

export const updateNewsSchema = z
  .object({
    lockVersion: z.number().int().min(1),

    title: z.string().trim().min(5).max(220).optional(),

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

    summary: z.string().trim().min(20).max(600).optional(),

    body: z
      .object({
        version: z.number().int().positive().default(1),
        blocks: z.array(newsBlockSchema).max(500),
      })
      .optional(),

    categoryIds: z
      .array(z.string().uuid())
      .min(1)
      .max(5)
      .refine((categoryIds) => new Set(categoryIds).size === categoryIds.length, {
        message: 'Las categorías no pueden repetirse.',
      })
      .optional(),

    coverMediaId: z.string().uuid().optional(),

    seoTitle: z.string().trim().min(5).max(70).nullable().optional(),

    metaDescription: z.string().trim().min(20).max(180).nullable().optional(),
  })
  .superRefine((value, context) => {
    const hasChanges = [
      value.title,
      value.slug,
      value.summary,
      value.body,
      value.categoryIds,
      value.coverMediaId,
      value.seoTitle,
      value.metaDescription,
    ].some((field) => field !== undefined);

    if (!hasChanges) {
      context.addIssue({
        code: 'custom',
        message: 'Debe enviar al menos un cambio.',
      });
    }
  });

export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export const archiveNewsSchema = z.object({
  lockVersion: z.number().int().min(1),

  reason: z.string().trim().min(10).max(500).optional(),
});

export type ArchiveNewsInput = z.infer<typeof archiveNewsSchema>;
