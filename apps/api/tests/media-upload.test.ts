import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { app } from '../src/app.ts';

async function withApiServer(assertion: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, '127.0.0.1');

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

test('rejects unsupported media uploads', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/editor/media/upload-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originalFilename: 'archivo.gif',
        mimeType: 'image/gif',
        sizeBytes: 1000,
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'MEDIA_UPLOAD_INVALID_INPUT');
  });
});

test('rejects an invalid media asset identifier', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/editor/media/not-a-uuid/complete`, {
      method: 'POST',
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'MEDIA_ASSET_INVALID_ID');
  });
});
