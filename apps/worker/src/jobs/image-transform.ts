import { createHash } from 'node:crypto';
import sharp from 'sharp';

sharp.cache(false);
sharp.concurrency(1);

export const imageVariantSpecs = [
  {
    kind: 'THUMBNAIL',
    width: 320,
    height: 180,
    quality: 76,
  },
  {
    kind: 'CARD',
    width: 768,
    height: 432,
    quality: 80,
  },
  {
    kind: 'HERO',
    width: 1600,
    height: 900,
    quality: 82,
  },
  {
    kind: 'MOBILE',
    width: 768,
    height: 960,
    quality: 80,
  },
] as const;

export type ImageVariantSpec = (typeof imageVariantSpecs)[number];

export interface OriginalImageInfo {
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  checksum: string;
}

export interface GeneratedImageVariant {
  kind: ImageVariantSpec['kind'];
  buffer: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  sizeBytes: number;
  checksum: string;
}

const mimeTypeByFormat: Readonly<Record<string, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function createChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function getOrientedDimensions(
  width: number,
  height: number,
  orientation: number | undefined,
): {
  width: number;
  height: number;
} {
  const shouldSwapDimensions = orientation !== undefined && orientation >= 5 && orientation <= 8;

  return shouldSwapDimensions
    ? {
        width: height,
        height: width,
      }
    : {
        width,
        height,
      };
}

export async function inspectOriginalImage(
  input: Buffer,
  declaredMimeType: string,
  maxPixels: number,
): Promise<OriginalImageInfo> {
  const metadata = await sharp(input, {
    failOn: 'error',
    sequentialRead: true,
    limitInputPixels: maxPixels,
  }).metadata();

  if (!metadata.format || !metadata.width || !metadata.height) {
    throw new Error('No se pudieron determinar el formato y las dimensiones de la imagen.');
  }

  const actualMimeType = mimeTypeByFormat[metadata.format];

  if (!actualMimeType) {
    throw new Error(`El formato real ${metadata.format} no está permitido.`);
  }

  const normalizedDeclaredMimeType = declaredMimeType.split(';', 1)[0]?.trim().toLowerCase();

  if (actualMimeType !== normalizedDeclaredMimeType) {
    throw new Error(
      `El tipo real ${actualMimeType} no coincide con el declarado ${declaredMimeType}.`,
    );
  }

  const dimensions = getOrientedDimensions(metadata.width, metadata.height, metadata.orientation);

  return {
    mimeType: actualMimeType,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: input.byteLength,
    checksum: createChecksum(input),
  };
}

export async function generateImageVariant(
  input: Buffer,
  spec: ImageVariantSpec,
  maxPixels: number,
): Promise<GeneratedImageVariant> {
  const result = await sharp(input, {
    failOn: 'error',
    sequentialRead: true,
    limitInputPixels: maxPixels,
  })
    .rotate()
    .resize({
      width: spec.width,
      height: spec.height,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .webp({
      quality: spec.quality,
      effort: 2,
    })
    .toBuffer({
      resolveWithObject: true,
    });

  return {
    kind: spec.kind,
    buffer: result.data,
    mimeType: 'image/webp',
    width: result.info.width,
    height: result.info.height,
    sizeBytes: result.info.size,
    checksum: createChecksum(result.data),
  };
}
