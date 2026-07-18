import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/app.ts';
import { authenticatedFetch, testAuthenticateAccessToken } from './helpers/test-auth.ts';

const app = createApp({ authenticateAccessToken: testAuthenticateAccessToken });

async function withServer(assertion: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address() as AddressInfo;
    await assertion(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('rejects a trusted source that does not use HTTPS', async () => {
  await withServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news-sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Fuente insegura',
        domain: 'example.org',
        websiteUrl: 'http://example.org/news',
        type: 'NEWS_MEDIA',
        ingestionMethod: 'MANUAL',
      }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'EXTERNAL_NEWS_SOURCE_INVALID_INPUT');
  });
});

test('rejects an RSS source without a feed URL', async () => {
  await withServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news-sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Fuente RSS incompleta',
        domain: 'example.org',
        websiteUrl: 'https://example.org/news',
        type: 'NEWS_MEDIA',
        ingestionMethod: 'RSS',
      }),
    });

    assert.equal(response.status, 400);
  });
});

test('rejects invalid source and candidate identifiers before accessing the database', async () => {
  await withServer(async (baseUrl) => {
    const sourceResponse = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/news-sources/not-a-uuid`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    const candidateResponse = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/external-news/not-a-uuid/import`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );

    assert.equal(sourceResponse.status, 400);
    assert.equal(candidateResponse.status, 400);
  });
});

test('does not allow a draft to replace the featured publication', async () => {
  await withServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Noticia de prueba editorial',
        summary: 'Resumen suficientemente extenso para validar la noticia editorial de prueba.',
        body: {
          schemaVersion: 1,
          editor: 'tiptap',
          document: { type: 'doc', content: [] },
        },
        categoryIds: [],
        featured: true,
        publishNow: false,
      }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'NEWS_INVALID_INPUT');
  });
});
