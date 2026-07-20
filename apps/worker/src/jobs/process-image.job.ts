import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getPrismaClient } from '@intgarti/database';
import { env } from '../config/env.js';
import {
  generateImageVariant,
  imageVariantSpecs,
  inspectOriginalImage,
} from './image-transform.js';

const storageClient = new S3Client({
  endpoint: env.S3_INTERNAL_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error('El almacenamiento devolvió el objeto sin contenido.');
  }

  if (typeof body === 'object' && body !== null) {
    const transformToByteArray = Reflect.get(body, 'transformToByteArray');

    if (typeof transformToByteArray === 'function') {
      const bytes = await Reflect.apply(transformToByteArray, body, []);

      return Buffer.from(bytes as Uint8Array);
    }

    const asyncIterator = Reflect.get(body, Symbol.asyncIterator);

    if (typeof asyncIterator === 'function') {
      const chunks: Buffer[] = [];

      for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    }
  }

  throw new Error('No se pudo leer el contenido descargado.');
}

function createVariantObjectKey(mediaAssetId: string, kind: string, createdAt: Date): string {
  const year = createdAt.getUTCFullYear();
  const month = String(createdAt.getUTCMonth() + 1).padStart(2, '0');

  return ['variants', String(year), month, mediaAssetId, `${kind.toLowerCase()}.webp`].join('/');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Ocurrió un error desconocido al procesar la imagen.';
}

export async function processNextImage(): Promise<{
  mediaAssetId: string;
  variantsCreated: number;
} | null> {
  const prisma = getPrismaClient();

  const mediaAsset = await prisma.mediaAsset.findFirst({
    where: {
      status: 'PROCESSING',
    },
    orderBy: {
      updatedAt: 'asc',
    },
    select: {
      id: true,
      bucket: true,
      objectKey: true,
      mimeType: true,
      createdAt: true,
    },
  });

  if (!mediaAsset) {
    return null;
  }

  try {
    const storedObject = await storageClient.send(
      new GetObjectCommand({
        Bucket: mediaAsset.bucket,
        Key: mediaAsset.objectKey,
      }),
    );

    const originalBuffer = await bodyToBuffer(storedObject.Body);

    const original = await inspectOriginalImage(
      originalBuffer,
      mediaAsset.mimeType,
      env.IMAGE_MAX_PIXELS,
    );

    await prisma.mediaVariant.upsert({
      where: {
        mediaAssetId_kind: {
          mediaAssetId: mediaAsset.id,
          kind: 'ORIGINAL',
        },
      },
      update: {
        objectKey: mediaAsset.objectKey,
        mimeType: original.mimeType,
        sizeBytes: BigInt(original.sizeBytes),
        width: original.width,
        height: original.height,
        checksum: original.checksum,
      },
      create: {
        mediaAssetId: mediaAsset.id,
        kind: 'ORIGINAL',
        objectKey: mediaAsset.objectKey,
        mimeType: original.mimeType,
        sizeBytes: BigInt(original.sizeBytes),
        width: original.width,
        height: original.height,
        checksum: original.checksum,
      },
    });

    for (const spec of imageVariantSpecs) {
      const variant = await generateImageVariant(originalBuffer, spec, env.IMAGE_MAX_PIXELS);

      const variantObjectKey = createVariantObjectKey(
        mediaAsset.id,
        variant.kind,
        mediaAsset.createdAt,
      );

      await storageClient.send(
        new PutObjectCommand({
          Bucket: mediaAsset.bucket,
          Key: variantObjectKey,
          Body: variant.buffer,
          ContentType: variant.mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );

      await prisma.mediaVariant.upsert({
        where: {
          mediaAssetId_kind: {
            mediaAssetId: mediaAsset.id,
            kind: variant.kind,
          },
        },
        update: {
          objectKey: variantObjectKey,
          mimeType: variant.mimeType,
          sizeBytes: BigInt(variant.sizeBytes),
          width: variant.width,
          height: variant.height,
          checksum: variant.checksum,
        },
        create: {
          mediaAssetId: mediaAsset.id,
          kind: variant.kind,
          objectKey: variantObjectKey,
          mimeType: variant.mimeType,
          sizeBytes: BigInt(variant.sizeBytes),
          width: variant.width,
          height: variant.height,
          checksum: variant.checksum,
        },
      });
    }

    await prisma.mediaAsset.update({
      where: {
        id: mediaAsset.id,
      },
      data: {
        mimeType: original.mimeType,
        sizeBytes: BigInt(original.sizeBytes),
        width: original.width,
        height: original.height,
        checksumSha256: original.checksum,
        status: 'READY',
        errorMessage: null,
      },
    });

    return {
      mediaAssetId: mediaAsset.id,
      variantsCreated: imageVariantSpecs.length + 1,
    };
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error).slice(0, 2000);

    await prisma.mediaAsset.updateMany({
      where: {
        id: mediaAsset.id,
        status: 'PROCESSING',
      },
      data: {
        status: 'REJECTED',
        errorMessage,
      },
    });

    throw error;
  }
}
