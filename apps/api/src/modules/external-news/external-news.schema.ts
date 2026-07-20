import { z } from 'zod';

export const externalNewsItemIdParamsSchema = z.object({
  itemId: z.string().uuid(),
});

export const listExternalNewsItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(2).max(120).optional(),
  sourceId: z.string().uuid().optional(),
  status: z.enum(['DISCOVERED', 'REVIEWED', 'IMPORTED', 'DISCARDED', 'FAILED']).optional(),
});

export const importExternalNewsItemSchema = z
  .object({
    title: z.string().trim().min(5).max(220).optional(),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    summary: z.string().trim().min(20).max(600).optional(),
    bodyText: z.string().trim().max(20_000).optional(),
    categoryIds: z
      .array(z.string().uuid())
      .max(5)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Las categorías no pueden repetirse.',
      })
      .default([]),
    featured: z.boolean().default(false),
    publishNow: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.featured && !value.publishNow) {
      context.addIssue({
        code: 'custom',
        path: ['featured'],
        message: 'Para destacar la noticia debe publicarse en la misma operación.',
      });
    }
  });

export const discardExternalNewsItemSchema = z.object({
  reason: z.string().trim().min(5).max(500).optional(),
});

export type ListExternalNewsItemsInput = z.infer<typeof listExternalNewsItemsQuerySchema>;
export type ImportExternalNewsItemInput = z.infer<typeof importExternalNewsItemSchema>;
export type DiscardExternalNewsItemInput = z.infer<typeof discardExternalNewsItemSchema>;
