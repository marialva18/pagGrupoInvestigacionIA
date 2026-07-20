import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@intgarti/contracts';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getPrismaClient } from '@intgarti/database';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import type { CreateMediaUploadRequestInput } from './media-upload.schema.js';

type MediaActor = Pick<AuthenticatedUser, 'id'>;

const extensionByMimeType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

const sharedS3Configuration = {
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
};

const uploadSigningClient = new S3Client({
  ...sharedS3Configuration,
  endpoint: env.S3_PUBLIC_ENDPOINT,
});

const storageClient = new S3Client({
  ...sharedS3Configuration,
  endpoint: env.S3_INTERNAL_ENDPOINT,
});

function createObjectKey(mediaAssetId: string, extension: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  return `original/${year}/${month}/${mediaAssetId}.${extension}`;
}

function getHttpStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const metadata = Reflect.get(error, '$metadata');

  if (typeof metadata !== 'object' || metadata === null) {
    return undefined;
  }

  const statusCode = Reflect.get(metadata, 'httpStatusCode');

  return typeof statusCode === 'number' ? statusCode : undefined;
}

function normalizeMimeType(mimeType: string | undefined): string | undefined {
  return mimeType?.split(';', 1)[0]?.trim().toLowerCase();
}

export async function createMediaUploadRequest(
  actor: MediaActor,
  input: CreateMediaUploadRequestInput,
) {
  const prisma = getPrismaClient();

  const now = new Date();
  const mediaAssetId = randomUUID();
  const extension = extensionByMimeType[input.mimeType];

  const objectKey = createObjectKey(mediaAssetId, extension, now);

  const uploadCommand = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey,
    ContentType: input.mimeType,
  });

  const uploadUrl = await getSignedUrl(uploadSigningClient, uploadCommand, {
    expiresIn: env.MEDIA_UPLOAD_URL_TTL_SECONDS,
  });

  const provider = env.STORAGE_PROVIDER === 'minio' ? 'MINIO' : 'SUPABASE';

  await prisma.mediaAsset.create({
    data: {
      id: mediaAssetId,
      provider,
      bucket: env.S3_BUCKET,
      objectKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      extension,
      sizeBytes: BigInt(input.sizeBytes),
      altText: input.altText?.trim() || null,
      status: 'UPLOADING',
      createdById: actor.id,
    },
  });

  const expiresAt = new Date(now.getTime() + env.MEDIA_UPLOAD_URL_TTL_SECONDS * 1000);

  return {
    mediaAssetId,
    objectKey,
    uploadUrl,
    method: 'PUT' as const,
    requiredHeaders: {
      'Content-Type': input.mimeType,
    },
    expiresAt: expiresAt.toISOString(),
    maxBytes: env.MEDIA_UPLOAD_MAX_BYTES,
  };
}

export async function completeMediaUpload(actor: MediaActor, mediaAssetId: string) {
  const prisma = getPrismaClient();

  const mediaAsset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      createdById: actor.id,
    },
    select: {
      id: true,
      bucket: true,
      objectKey: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
    },
  });

  if (!mediaAsset) {
    throw new AppError('No se encontró la imagen solicitada.', 404, 'MEDIA_ASSET_NOT_FOUND');
  }

  if (mediaAsset.status === 'PROCESSING' || mediaAsset.status === 'READY') {
    return {
      mediaAssetId: mediaAsset.id,
      objectKey: mediaAsset.objectKey,
      mimeType: mediaAsset.mimeType,
      sizeBytes: Number(mediaAsset.sizeBytes),
      status: mediaAsset.status,
      alreadyCompleted: true,
    };
  }

  if (mediaAsset.status !== 'UPLOADING') {
    throw new AppError(
      `La imagen no puede completarse desde el estado ${mediaAsset.status}.`,
      409,
      'MEDIA_UPLOAD_INVALID_STATE',
    );
  }

  let metadata;

  try {
    metadata = await storageClient.send(
      new HeadObjectCommand({
        Bucket: mediaAsset.bucket,
        Key: mediaAsset.objectKey,
      }),
    );
  } catch (error: unknown) {
    if (getHttpStatusCode(error) === 404) {
      throw new AppError(
        'La imagen todavía no se encuentra en el almacenamiento.',
        409,
        'MEDIA_OBJECT_NOT_UPLOADED',
      );
    }

    throw error;
  }

  const actualSizeBytes = metadata.ContentLength;
  const actualMimeType = normalizeMimeType(metadata.ContentType);

  const validationErrors: string[] = [];

  if (actualSizeBytes === undefined) {
    validationErrors.push('El almacenamiento no devolvió el tamaño del archivo.');
  } else if (BigInt(actualSizeBytes) !== mediaAsset.sizeBytes) {
    validationErrors.push(
      `El tamaño recibido (${actualSizeBytes}) no coincide con el declarado (${mediaAsset.sizeBytes}).`,
    );
  }

  if (!actualMimeType) {
    validationErrors.push('El almacenamiento no devolvió el tipo MIME.');
  } else if (actualMimeType !== mediaAsset.mimeType.toLowerCase()) {
    validationErrors.push(
      `El tipo MIME recibido (${actualMimeType}) no coincide con el declarado (${mediaAsset.mimeType}).`,
    );
  }

  if (validationErrors.length > 0) {
    const errorMessage = validationErrors.join(' ');

    await prisma.mediaAsset.update({
      where: {
        id: mediaAsset.id,
      },
      data: {
        status: 'REJECTED',
        errorMessage,
      },
    });

    throw new AppError(errorMessage, 422, 'MEDIA_UPLOAD_METADATA_MISMATCH');
  }

  const transition = await prisma.mediaAsset.updateMany({
    where: {
      id: mediaAsset.id,
      status: 'UPLOADING',
    },
    data: {
      status: 'PROCESSING',
      errorMessage: null,
    },
  });

  if (transition.count === 0) {
    const currentMediaAsset = await prisma.mediaAsset.findUnique({
      where: {
        id: mediaAsset.id,
      },
      select: {
        status: true,
      },
    });

    if (currentMediaAsset?.status === 'PROCESSING' || currentMediaAsset?.status === 'READY') {
      return {
        mediaAssetId: mediaAsset.id,
        objectKey: mediaAsset.objectKey,
        mimeType: mediaAsset.mimeType,
        sizeBytes: Number(mediaAsset.sizeBytes),
        status: currentMediaAsset.status,
        alreadyCompleted: true,
      };
    }

    throw new AppError(
      'El estado de la imagen cambió durante la confirmación.',
      409,
      'MEDIA_UPLOAD_STATE_CHANGED',
    );
  }

  return {
    mediaAssetId: mediaAsset.id,
    objectKey: mediaAsset.objectKey,
    mimeType: actualMimeType,
    sizeBytes: actualSizeBytes,
    status: 'PROCESSING' as const,
    alreadyCompleted: false,
  };
}

export async function getMediaUploadStatus(actor: MediaActor, mediaAssetId: string) {
  const prisma = getPrismaClient();
  const mediaAsset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      createdById: actor.id,
    },
    select: {
      id: true,
      status: true,
      errorMessage: true,
    },
  });

  if (!mediaAsset) {
    throw new AppError('No se encontró la imagen solicitada.', 404, 'MEDIA_ASSET_NOT_FOUND');
  }

  return {
    mediaAssetId: mediaAsset.id,
    status: mediaAsset.status,
    errorMessage: mediaAsset.errorMessage,
  };
}
