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

test('returns health data inside the success envelope', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);

    const body = (await response.json()) as {
      data?: {
        status?: string;
        service?: string;
        timestamp?: string;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.data?.status, 'ok');
    assert.equal(body.data?.service, 'intgarti-api');
    assert.equal(typeof body.data?.timestamp, 'string');
  });
});

test('returns request id inside the error envelope', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/not-found`);

    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        requestId?: string;
      };
    };

    assert.equal(response.status, 404);
    assert.equal(body.error?.code, 'NOT_FOUND');
    assert.equal(typeof body.error?.requestId, 'string');
    assert.equal(response.headers.get('x-request-id'), body.error?.requestId);
  });
});
