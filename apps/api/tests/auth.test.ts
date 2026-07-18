import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { AuthenticatedUser } from '@intgarti/contracts';
import express, { type Express } from 'express';
import {
  createRequireAuthenticatedUser,
  extractBearerToken,
  requireAdmin,
  requireEditor,
} from '../src/modules/auth/auth.middleware.ts';
import { createAuthRouter } from '../src/modules/auth/auth.routes.ts';
import { errorMiddleware } from '../src/common/middlewares/error.middleware.ts';

const editorUser: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'editor@intgarti.test',
  displayName: 'Editor INTGARTI',
  role: 'EDITOR',
  status: 'ACTIVE',
  lastLoginAt: null,
};

const adminUser: AuthenticatedUser = {
  ...editorUser,
  id: '00000000-0000-4000-8000-000000000002',
  email: 'admin@intgarti.test',
  displayName: 'Administrador INTGARTI',
  role: 'ADMIN',
};

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

function createTestApp(): Express {
  const application = express();

  application.use(
    '/auth',
    createAuthRouter(async (accessToken) => {
      if (accessToken === 'editor-token') {
        return editorUser;
      }

      if (accessToken === 'admin-token') {
        return adminUser;
      }

      throw new Error('Invalid test token');
    }),
  );

  application.get(
    '/editor',
    createRequireAuthenticatedUser(async (accessToken) => {
      if (accessToken === 'admin-token') {
        return adminUser;
      }

      return editorUser;
    }),
    requireEditor,
    (_request, response) => {
      response.status(200).json({
        data: {
          allowed: true,
        },
      });
    },
  );

  application.get(
    '/admin',
    createRequireAuthenticatedUser(async (accessToken) => {
      if (accessToken === 'admin-token') {
        return adminUser;
      }

      return editorUser;
    }),
    requireAdmin,
    (_request, response) => {
      response.status(200).json({
        data: {
          allowed: true,
        },
      });
    },
  );

  application.use(errorMiddleware);

  return application;
}

test('extracts a valid Bearer token', () => {
  assert.equal(extractBearerToken('Bearer test-token'), 'test-token');

  assert.equal(extractBearerToken('bearer another-token'), 'another-token');
});

test('rejects invalid authorization formats', () => {
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken('Basic credentials'), null);
  assert.equal(extractBearerToken('Bearer'), null);
});

test('returns the authenticated session', async () => {
  await withServer(createTestApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/session`, {
      headers: {
        Authorization: 'Bearer editor-token',
      },
    });

    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      data: {
        user: AuthenticatedUser;
      };
    };

    assert.equal(body.data.user.role, 'EDITOR');
    assert.equal(body.data.user.email, editorUser.email);
  });
});

test('rejects a session without a token', async () => {
  await withServer(createTestApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/session`);

    assert.equal(response.status, 401);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'AUTH_REQUIRED');
  });
});

test('allows an editor to use editor routes', async () => {
  await withServer(createTestApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/editor`, {
      headers: {
        Authorization: 'Bearer editor-token',
      },
    });

    assert.equal(response.status, 200);
  });
});

test('forbids an editor from using admin routes', async () => {
  await withServer(createTestApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/admin`, {
      headers: {
        Authorization: 'Bearer editor-token',
      },
    });

    assert.equal(response.status, 403);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'AUTH_FORBIDDEN');
  });
});

test('allows an administrator to use admin routes', async () => {
  await withServer(createTestApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/admin`, {
      headers: {
        Authorization: 'Bearer admin-token',
      },
    });

    assert.equal(response.status, 200);
  });
});
