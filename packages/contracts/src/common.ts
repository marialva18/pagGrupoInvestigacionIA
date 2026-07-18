import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const isoDateTimeSchema = z.string().datetime({
  offset: true,
});

export const slugSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'LOCK_VERSION_CONFLICT',
  'RATE_LIMIT_EXCEEDED',
  'STORAGE_ERROR',
  'IMPORT_DUPLICATE',
  'INTERNAL_ERROR',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().nullable().optional(),
  requestId: z.string().min(1).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export interface ApiSuccessResponse<TData, TMeta = Record<string, unknown>> {
  data: TData;
  meta?: TMeta;
}
