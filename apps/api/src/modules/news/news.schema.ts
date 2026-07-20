import { z } from 'zod';
import { newsBodyInputSchema } from '../../common/content/rich-text-body.js';

const sourceTypeSchema = z.enum([
  'ACADEMIC',
  'NEWS_AGENCY',
  'NEWS_MEDIA',
  'CORPORATE_RESEARCH',
  'CORPORATE_BLOG',
  'GOVERNMENT',
  'UNIVERSITY',
  'OTHER',
]);

const externalFieldsSchema = {
  origin: z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
  externalUrl: z.string().url().max(1500).nullable().optional(),
  sourceName: z.string().trim().min(2).max(180).nullable().optional(),
  sourceType: sourceTypeSchema.nullable().optional(),
  originalTitle: z.string().trim().max(300).nullable().optional(),
  externalPublishedAt: z.coerce.date().nullable().optional(),
};

export const createNewsSchema = z
  .object({
    title: z.string().trim().min(5).max(220),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    summary: z.string().trim().min(20).max(600),
    body: newsBodyInputSchema,
    categoryIds: z
      .array(z.string().uuid())
      .max(5)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Las categorías no pueden repetirse.',
      })
      .default([]),
    coverMediaId: z.string().uuid().nullable().optional(),
    seoTitle: z.string().trim().min(5).max(70).optional(),
    metaDescription: z.string().trim().min(20).max(180).optional(),
    featured: z.boolean().default(false),
    publishNow: z.boolean().default(false),
    expiresAt: z.coerce.date().nullable().optional(),
    ...externalFieldsSchema,
  })
  .superRefine((value, context) => {
    if (value.origin === 'EXTERNAL' && (!value.externalUrl || !value.sourceName)) {
      context.addIssue({
        code: 'custom',
        message: 'Una noticia externa requiere URL original y nombre de fuente.',
      });
    }

    if (value.expiresAt && value.expiresAt <= new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'La fecha de caducidad debe ser futura.',
      });
    }

    if (value.featured && !value.publishNow) {
      context.addIssue({
        code: 'custom',
        path: ['featured'],
        message: 'Para marcarla como destacada debe publicarse en la misma operación.',
      });
    }
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
    changeSummary: z.string().trim().min(10).max(500).optional(),
    title: z.string().trim().min(5).max(220).optional(),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    summary: z.string().trim().min(20).max(600).optional(),
    body: newsBodyInputSchema.optional(),
    categoryIds: z
      .array(z.string().uuid())
      .max(5)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Las categorías no pueden repetirse.',
      })
      .optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
    seoTitle: z.string().trim().min(5).max(70).nullable().optional(),
    metaDescription: z.string().trim().min(20).max(180).nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, context) => {
    const hasChanges = Object.entries(value).some(
      ([key, field]) => key !== 'lockVersion' && key !== 'changeSummary' && field !== undefined,
    );

    if (!hasChanges) {
      context.addIssue({ code: 'custom', message: 'Debe enviar al menos un cambio.' });
    }
  });

export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;

export const archiveNewsSchema = z.object({
  lockVersion: z.number().int().min(1),
  reason: z.string().trim().min(10).max(500).optional(),
});

export type ArchiveNewsInput = z.infer<typeof archiveNewsSchema>;

export const restoreNewsSchema = z.object({
  lockVersion: z.number().int().min(1),
  reason: z.string().trim().min(10).max(500).optional(),
});

export type RestoreNewsInput = z.infer<typeof restoreNewsSchema>;

export const publishNewsSchema = z.object({
  lockVersion: z.number().int().min(1).optional(),
  featured: z.boolean().optional(),
});

export const unpublishNewsSchema = z.object({
  lockVersion: z.number().int().min(1),
});

export const setNewsFeaturedSchema = z.object({
  featured: z.boolean(),
});

export type PublishNewsInput = z.infer<typeof publishNewsSchema>;
export type UnpublishNewsInput = z.infer<typeof unpublishNewsSchema>;
export type SetNewsFeaturedInput = z.infer<typeof setNewsFeaturedSchema>;
