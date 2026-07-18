import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

export const storageProviderSchema = z.enum(['MINIO', 'SUPABASE']);

export type StorageProvider = z.infer<typeof storageProviderSchema>;

export const mediaStatusSchema = z.enum([
  'PENDING',
  'UPLOADING',
  'PROCESSING',
  'READY',
  'REJECTED',
  'ARCHIVED',
]);

export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const mediaVariantKindSchema = z.enum(['ORIGINAL', 'THUMBNAIL', 'CARD', 'HERO', 'MOBILE']);

export type MediaVariantKind = z.infer<typeof mediaVariantKindSchema>;

export const mediaRightsStatusSchema = z.enum(['PENDING', 'VERIFIED', 'RESTRICTED']);

export type MediaRightsStatus = z.infer<typeof mediaRightsStatusSchema>;

export const mediaVariantSchema = z.object({
  id: uuidSchema,
  kind: mediaVariantKindSchema,
  url: z.string().url(),
  mimeType: z.string().min(1),
  sizeBytes: z.string().regex(/^\d+$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type MediaVariant = z.infer<typeof mediaVariantSchema>;

export const mediaReferenceSchema = z.object({
  id: uuidSchema,
  url: z.string().url(),
  altText: z.string().max(300).nullable(),
  caption: z.string().nullable(),
  credit: z.string().max(220).nullable(),
  rightsStatus: mediaRightsStatusSchema,
  status: mediaStatusSchema,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  variants: z.array(mediaVariantSchema),
});

export type MediaReference = z.infer<typeof mediaReferenceSchema>;

export const editorMediaAssetSchema = mediaReferenceSchema.extend({
  provider: storageProviderSchema,
  bucket: z.string().min(1).max(120),
  objectKey: z.string().min(1).max(500),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  extension: z.string().min(1).max(20),
  sizeBytes: z.string().regex(/^\d+$/),
  sourceUrl: z.string().url().nullable(),
  errorMessage: z.string().nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type EditorMediaAsset = z.infer<typeof editorMediaAssetSchema>;
