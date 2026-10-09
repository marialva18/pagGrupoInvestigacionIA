import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { app, createApp } from '../src/app.ts';
import { allowedOrigins, parseAllowedOrigins } from '../src/config/env.ts';
import { AppError } from '../src/common/errors/app-error.ts';
import { authProviderError } from '../src/modules/auth/auth-provider-error.ts';

async function withApiServer(
  assertion: (baseUrl: string) => Promise<void>,
  application = app,
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

test('preflight allows authorized origins and headers without authenticating', async () => {
  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/auth/session`, {
        method: 'OPTIONS',
        headers: {
          Origin: allowedOrigins[0]!,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigins[0]);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
      assert.match(response.headers.get('access-control-allow-headers') ?? '', /Authorization/i);
      assert.match(response.headers.get('access-control-allow-headers') ?? '', /Content-Type/i);
      assert.match(response.headers.get('vary') ?? '', /Origin/);
    },
    createApp({
      authenticateAccessToken: async () => {
        throw new Error('OPTIONS must not authenticate');
      },
    }),
  );
});

test('unauthorized origins are denied without CORS reflection', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/session`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://untrusted.invalid', 'Access-Control-Request-Method': 'GET' },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal((await response.json()).error.code, 'CORS_ORIGIN_DENIED');
  });
});

test('session failures retain CORS headers and distinct status codes', async () => {
  for (const [status, code] of [
    [401, 'AUTH_INVALID_TOKEN'],
    [403, 'AUTH_USER_INACTIVE'],
    [503, 'AUTH_NOT_CONFIGURED'],
  ] as const) {
    await withApiServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/auth/session`, {
          headers: { Origin: allowedOrigins[0]!, Authorization: 'Bearer test-token' },
        });
        assert.equal(response.status, status);
        assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigins[0]);
        assert.equal((await response.json()).error.code, code);
      },
      createApp({
        authenticateAccessToken: async () => {
          throw new AppError('Acceso no disponible.', status, code);
        },
      }),
    );
  }
});

test('origin configuration normalizes origins without allowing wildcard or paths', () => {
  assert.deepEqual(
    parseAllowedOrigins(
      'https://paggrupoinvestigacionia-7ijt.onrender.com/, https://paggrupoinvestigacionia-7ijt.onrender.com',
    ),
    ['https://paggrupoinvestigacionia-7ijt.onrender.com'],
  );
  for (const value of [
    '*',
    '',
    'https://site.test/path',
    'https://user:password@site.test',
    'https://site.test?q=1',
  ]) {
    assert.throws(() => parseAllowedOrigins(value));
  }
});

test('provider failures distinguish tokens, outage and API key configuration', () => {
  assert.equal(
    authProviderError({ status: 401, message: 'Invalid JWT' }).code,
    'AUTH_INVALID_TOKEN',
  );
  assert.equal(authProviderError({ status: 403, message: 'Invalid token' }).statusCode, 401);
  assert.equal(
    authProviderError({ status: 401, message: 'No API key found in request' }).code,
    'AUTH_NOT_CONFIGURED',
  );
  assert.equal(
    authProviderError({ status: 500, message: 'Internal error' }).code,
    'AUTH_UNAVAILABLE',
  );
  assert.equal(
    authProviderError({ name: 'AuthRetryableFetchError', message: 'fetch failed' }).statusCode,
    503,
  );
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
