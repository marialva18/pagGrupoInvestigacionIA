import { z } from 'zod';

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

const ingestionMethodSchema = z.enum(['AUTO', 'RSS', 'ATOM', 'SITEMAP', 'HTML', 'MANUAL']);
const reviewModeSchema = z.enum(['REQUIRED', 'AUTOMATIC']);
const statusSchema = z.enum(['ACTIVE', 'PAUSED']);

const httpsUrlSchema = z
  .string()
  .url()
  .max(1200)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'La URL debe utilizar HTTPS.' },
  );

const keywordArraySchema = z
  .array(z.string().trim().min(2).max(80))
  .max(100)
  .transform((values) => [...new Set(values.map((value) => value.toLowerCase()))]);

const urlPatternArraySchema = z
  .array(z.string().trim().min(1).max(240))
  .max(60)
  .transform((values) => [...new Set(values)]);

const externalNewsSourceFields = {
  name: z.string().trim().min(2).max(180),
  domain: z.string().trim().min(3).max(255).optional(),
  websiteUrl: httpsUrlSchema,
  listingUrl: httpsUrlSchema.nullable().optional(),
  feedUrl: httpsUrlSchema.nullable().optional(),
  type: sourceTypeSchema,
  status: statusSchema.default('PAUSED'),
  ingestionMethod: ingestionMethodSchema.default('AUTO'),
  reviewMode: reviewModeSchema.default('REQUIRED'),
  language: z.string().trim().min(2).max(12).default('es'),
  includeKeywords: keywordArraySchema.default([]),
  excludeKeywords: keywordArraySchema.default([]),
  includeUrlPatterns: urlPatternArraySchema.default([]),
  excludeUrlPatterns: urlPatternArraySchema.default([]),
  minimumRelevanceScore: z.number().int().min(0).max(100).default(30),
  maxItemsPerSync: z.number().int().min(1).max(100).default(15),
  checkIntervalMinutes: z.number().int().min(15).max(10_080).default(360),
};

function validateTechnicalUrlRequirement(
  value: {
    ingestionMethod?: string | undefined;
    feedUrl?: string | null | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (
    value.ingestionMethod &&
    ['RSS', 'ATOM', 'SITEMAP'].includes(value.ingestionMethod) &&
    !value.feedUrl
  ) {
    context.addIssue({
      code: 'custom',
      path: ['feedUrl'],
      message: 'RSS, Atom o Sitemap requieren una URL técnica.',
    });
  }
}

export const externalNewsSourceIdParamsSchema = z.object({
  sourceId: z.string().uuid(),
});

export const listExternalNewsSourcesQuerySchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  status: statusSchema.optional(),
});

export const createExternalNewsSourceSchema = z
  .object(externalNewsSourceFields)
  .superRefine(validateTechnicalUrlRequirement);

export const updateExternalNewsSourceSchema = z
  .object({
    name: externalNewsSourceFields.name.optional(),
    domain: externalNewsSourceFields.domain,
    websiteUrl: externalNewsSourceFields.websiteUrl.optional(),
    listingUrl: externalNewsSourceFields.listingUrl,
    feedUrl: externalNewsSourceFields.feedUrl,
    type: externalNewsSourceFields.type.optional(),
    status: statusSchema.optional(),
    ingestionMethod: ingestionMethodSchema.optional(),
    reviewMode: reviewModeSchema.optional(),
    language: z.string().trim().min(2).max(12).optional(),
    includeKeywords: keywordArraySchema.optional(),
    excludeKeywords: keywordArraySchema.optional(),
    includeUrlPatterns: urlPatternArraySchema.optional(),
    excludeUrlPatterns: urlPatternArraySchema.optional(),
    minimumRelevanceScore: z.number().int().min(0).max(100).optional(),
    maxItemsPerSync: z.number().int().min(1).max(100).optional(),
    checkIntervalMinutes: z.number().int().min(15).max(10_080).optional(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Debe enviar al menos un campo para actualizar.',
      });
    }

    validateTechnicalUrlRequirement(value, context);
  });

export const detectExternalNewsSourceSchema = z
  .object({
    name: z.string().trim().min(2).max(180).default('Fuente en evaluación'),
    domain: z.string().trim().min(3).max(255).optional(),
    websiteUrl: httpsUrlSchema,
    listingUrl: httpsUrlSchema.nullable().optional(),
    feedUrl: httpsUrlSchema.nullable().optional(),
    ingestionMethod: ingestionMethodSchema.default('AUTO'),
    language: z.string().trim().min(2).max(12).default('es'),
    includeKeywords: keywordArraySchema.default([]),
    excludeKeywords: keywordArraySchema.default([]),
    includeUrlPatterns: urlPatternArraySchema.default([]),
    excludeUrlPatterns: urlPatternArraySchema.default([]),
    minimumRelevanceScore: z.number().int().min(0).max(100).default(30),
    maxItemsPerSync: z.number().int().min(1).max(5).default(5),
  })
  .superRefine(validateTechnicalUrlRequirement);

export type ListExternalNewsSourcesInput = z.infer<typeof listExternalNewsSourcesQuerySchema>;
export type CreateExternalNewsSourceInput = z.infer<typeof createExternalNewsSourceSchema>;
export type UpdateExternalNewsSourceInput = z.infer<typeof updateExternalNewsSourceSchema>;
export type DetectExternalNewsSourceInput = z.infer<typeof detectExternalNewsSourceSchema>;
