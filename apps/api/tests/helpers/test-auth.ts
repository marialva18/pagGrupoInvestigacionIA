import type { AuthenticatedUser } from '@intgarti/contracts';
import { AppError } from '../../src/common/errors/app-error.ts';
import type { AuthenticateAccessToken } from '../../src/modules/auth/auth.types.ts';

export const editorUser: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'editor@intgarti.test',
  displayName: 'Editor INTGARTI',
  role: 'EDITOR',
  status: 'ACTIVE',
  lastLoginAt: null,
};

export const adminUser: AuthenticatedUser = {
  ...editorUser,
  id: '00000000-0000-4000-8000-000000000002',
  email: 'admin@intgarti.test',
  displayName: 'Administrador INTGARTI',
  role: 'ADMIN',
};

export const testAuthenticateAccessToken: AuthenticateAccessToken = async (accessToken) => {
  if (accessToken === 'editor-token') {
    return editorUser;
  }

  if (accessToken === 'admin-token') {
    return adminUser;
  }

  throw new AppError('Token de prueba inválido.', 401, 'AUTH_INVALID_TOKEN');
};

export function authenticatedFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);

  headers.set('Authorization', 'Bearer editor-token');

  return fetch(input, {
    ...init,
    headers,
  });
}
