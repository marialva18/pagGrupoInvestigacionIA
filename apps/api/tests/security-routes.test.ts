import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express, { type Express } from 'express';
import { resolveEditorRoutesEnabled } from '../src/config/env.ts';
import { createApiV1Router } from '../src/routes/index.ts';

async function withServer(
  application: Express,
  assertion: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = application.listen(0, '127.0.0.1');

  await once(server, 'listening');

  try {
    const address = server.address() as AddressInfo;
    await assertion(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test('enables editor routes by default outside production', () => {
  assert.equal(resolveEditorRoutesEnabled('development', undefined), true);
  assert.equal(resolveEditorRoutesEnabled('test', undefined), true);
});

test('disables editor routes by default in production', () => {
  assert.equal(resolveEditorRoutesEnabled('production', undefined), false);
});

test('respects an explicitly configured editor routes value', () => {
  assert.equal(resolveEditorRoutesEnabled('production', true), true);
  assert.equal(resolveEditorRoutesEnabled('development', false), false);
});

test('does not expose editor routes when they are disabled', async () => {
  const application = express();

  application.use(
    '/api/v1',
    createApiV1Router({
      enableEditorRoutes: false,
    }),
  );

  await withServer(application, async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/api/v1/health`);
    const editorResponse = await fetch(`${baseUrl}/api/v1/editor/news`);

    assert.equal(healthResponse.status, 200);
    assert.equal(editorResponse.status, 404);
  });
});
