import assert from 'node:assert/strict';
import test from 'node:test';
import { toJsonObject, toJsonValue } from '../src/utils/json.ts';

test('normalizes JSON-compatible metadata without dropping audit fields', () => {
  const publishedAt = new Date('2026-07-20T12:00:00.000Z');
  const normalized = toJsonObject({
    title: 'Investigacion aplicada',
    score: 42,
    active: true,
    publishedAt,
    tags: ['ia', undefined, Number.NaN],
    nested: {
      source: 'rss',
      ignored: undefined,
    },
  });

  assert.deepEqual(normalized, {
    title: 'Investigacion aplicada',
    score: 42,
    active: true,
    publishedAt: '2026-07-20T12:00:00.000Z',
    tags: ['ia', null, null],
    nested: {
      source: 'rss',
    },
  });
});

test('removes values that cannot be represented as JSON', () => {
  const circular: Record<string, unknown> = { keep: 'value' };
  circular.self = circular;

  assert.deepEqual(
    toJsonObject({
      circular,
      fn: () => undefined,
      symbol: Symbol('x'),
      bigint: 1n,
      instance: new Set(['x']),
      keepNull: null,
    }),
    {
      circular: {
        keep: 'value',
      },
      keepNull: null,
    },
  );
});

test('returns undefined for unsupported top-level values', () => {
  assert.equal(toJsonValue(undefined), undefined);
  assert.equal(toJsonValue(1n), undefined);
});
