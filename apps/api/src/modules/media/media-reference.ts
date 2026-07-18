import type { MediaReference } from '@intgarti/contracts';
import { env } from '../../config/env.js';

export const mediaReferenceSelect = {
  id: true,
  bucket: true,
  objectKey: true,
  altText: true,
  caption: true,
  credit: true,
  rightsStatus: true,
  status: true,
  archivedAt: true,
  width: true,
  height: true,

  variants: {
    select: {
      id: true,
      kind: true,
      objectKey: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
    },

    orderBy: {
      kind: 'asc' as const,
    },
  },
} as const;

interface MediaReferenceRecord {
  id: string;
  bucket: string;
  objectKey: string;
  altText: string | null;
  caption: string | null;
  credit: string | null;
  rightsStatus: 'PENDING' | 'VERIFIED' | 'RESTRICTED';
  status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'REJECTED' | 'ARCHIVED';
  archivedAt: Date | null;
  width: number | null;
  height: number | null;

  variants: ReadonlyArray<{
    id: string;
    kind: 'ORIGINAL' | 'THUMBNAIL' | 'CARD' | 'HERO' | 'MOBILE';
    objectKey: string;
    mimeType: string;
    sizeBytes: bigint;
    width: number;
    height: number;
  }>;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function createPublicObjectUrl(bucket: string, objectKey: string): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedObjectKey = encodeObjectKey(objectKey);

  if (env.STORAGE_PROVIDER === 'supabase' && env.SUPABASE_URL) {
    return `${env.SUPABASE_URL.replace(
      /\/+$/,
      '',
    )}/storage/v1/object/public/${encodedBucket}/${encodedObjectKey}`;
  }

  return `${env.S3_PUBLIC_ENDPOINT.replace(/\/+$/, '')}/${encodedBucket}/${encodedObjectKey}`;
}

export function mapMediaReference(media: MediaReferenceRecord | null): MediaReference | null {
  if (
    !media ||
    media.status !== 'READY' ||
    media.archivedAt ||
    media.rightsStatus === 'RESTRICTED'
  ) {
    return null;
  }

  return {
    id: media.id,
    url: createPublicObjectUrl(media.bucket, media.objectKey),
    altText: media.altText,
    caption: media.caption,
    credit: media.credit,
    rightsStatus: media.rightsStatus,
    status: media.status,
    width: media.width,
    height: media.height,

    variants: media.variants.map((variant) => ({
      id: variant.id,
      kind: variant.kind,
      url: createPublicObjectUrl(media.bucket, variant.objectKey),
      mimeType: variant.mimeType,
      sizeBytes: variant.sizeBytes.toString(),
      width: variant.width,
      height: variant.height,
    })),
  };
}
