import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { AuthenticatedUser } from '@intgarti/contracts';
import express, { type Express } from 'express';
import { errorMiddleware } from '../src/common/middlewares/error.middleware.ts';
import { createApiV1Router } from '../src/routes/index.ts';

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

function createTestApp(): Express {
  const application = express();

  application.use(express.json());

  application.use(
    '/api/v1',
    createApiV1Router({
      enableEditorRoutes: true,
      authenticateAccessToken: async (accessToken) => {
        if (accessToken === 'admin-token') {
          return adminUser;
        }

        if (accessToken === 'editor-token') {
          return editorUser;
        }

        throw new Error('Invalid test token');
      },
    }),
  );

  application.use(errorMiddleware);

  return application;
}

async function withServer(assertion: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createTestApp().listen(0, '127.0.0.1');

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

test('rejects an invalid password recovery email', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/password-recovery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'invalid',
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'AUTH_PASSWORD_RECOVERY_INVALID_INPUT');
  });
});

test('requires a token to activate an invitation', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/activate-invitation`, {
      method: 'POST',
    });

    assert.equal(response.status, 401);
  });
});

test('requires authentication to invite users', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/admin/users/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'nuevo@intgarti.test',
        displayName: 'Nuevo Editor',
        role: 'EDITOR',
      }),
    });

    assert.equal(response.status, 401);
  });
});

test('forbids editors from inviting users', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/admin/users/invitations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer editor-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'nuevo@intgarti.test',
        displayName: 'Nuevo Editor',
        role: 'EDITOR',
      }),
    });

    assert.equal(response.status, 403);
  });
});

test('validates invitation input before calling services', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/admin/users/invitations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'invalid',
        displayName: '',
        role: 'EDITOR',
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'ADMIN_USER_INVITATION_INVALID_INPUT');
  });
});

test('rejects an invalid user identifier', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/admin/users/not-a-uuid`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
      }),
    });

    assert.equal(response.status, 400);
  });
});
