import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/app.ts';
import { authenticatedFetch, testAuthenticateAccessToken } from './helpers/test-auth.ts';

const app = createApp({
  authenticateAccessToken: testAuthenticateAccessToken,
});

async function withServer(assertion: (baseUrl: string) => Promise<void>): Promise<void> {
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

test('rejects an invalid member identifier', async () => {
  await withServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/members/not-a-uuid`);

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'MEMBER_INVALID_ID');
  });
});

test('rejects an invalid member payload', async () => {
  await withServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: '',
        roleTitle: '',
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'MEMBER_INVALID_INPUT');
  });
});

test('rejects an empty member update', async () => {
  await withServer(async (baseUrl) => {
    const response = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/members/00000000-0000-4000-8000-000000000001`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'MEMBER_UPDATE_INVALID_INPUT');
  });
});
