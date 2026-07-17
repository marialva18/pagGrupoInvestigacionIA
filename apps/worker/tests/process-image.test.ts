import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {
  generateImageVariant,
  imageVariantSpecs,
  inspectOriginalImage,
} from '../src/jobs/image-transform.ts';

test('generates responsive WebP image variants', async () => {
  const source = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: {
        r: 119,
        g: 37,
        b: 54,
      },
    },
  })
    .png()
    .toBuffer();

  const original = await inspectOriginalImage(source, 'image/png', 40_000_000);

  assert.equal(original.mimeType, 'image/png');
  assert.equal(original.width, 1200);
  assert.equal(original.height, 800);
  assert.equal(original.checksum.length, 64);

  for (const spec of imageVariantSpecs) {
    const variant = await generateImageVariant(source, spec, 40_000_000);

    assert.equal(variant.kind, spec.kind);
    assert.equal(variant.mimeType, 'image/webp');
    assert.ok(variant.width > 0);
    assert.ok(variant.height > 0);
    assert.ok(variant.width <= spec.width);
    assert.ok(variant.height <= spec.height);
    assert.ok(variant.sizeBytes > 0);
    assert.equal(variant.checksum.length, 64);

    const metadata = await sharp(variant.buffer).metadata();

    assert.equal(metadata.format, 'webp');
  }
});
