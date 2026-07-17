import { z } from 'zod';
import { env } from '../../config/env.js';

export const supportedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const createMediaUploadRequestSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),

  mimeType: z.enum(supportedImageMimeTypes),

  sizeBytes: z.number().int().positive().max(env.MEDIA_UPLOAD_MAX_BYTES),

  altText: z.string().trim().max(300).optional(),
});

export const completeMediaUploadParamsSchema = z.object({
  mediaAssetId: z.string().uuid(),
});

export type CreateMediaUploadRequestInput = z.infer<typeof createMediaUploadRequestSchema>;
