import type { AuthenticatedUser, UserRole } from '@intgarti/contracts';
import type { Request, RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { authenticateAccessToken } from './auth.service.js';
import type { AuthenticateAccessToken } from './auth.types.js';

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim());

  return match?.[1] ?? null;
}

export function getAuthenticatedUser(request: Request): AuthenticatedUser {
  if (!request.user) {
    throw new AppError('Se requiere autenticación.', 401, 'AUTH_REQUIRED');
  }

  return request.user;
}

export function createRequireAuthenticatedUser(
  authenticate: AuthenticateAccessToken = authenticateAccessToken,
): RequestHandler {
  return (request, _response, next) => {
    const accessToken = extractBearerToken(request.header('authorization'));

    if (!accessToken) {
      next(new AppError('Se requiere autenticación.', 401, 'AUTH_REQUIRED'));

      return;
    }

    void authenticate(accessToken)
      .then((user) => {
        request.user = user;
        next();
      })
      .catch(next);
  };
}

function requireRole(allowedRoles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    let user: AuthenticatedUser;

    try {
      user = getAuthenticatedUser(request);
    } catch (error: unknown) {
      next(error);
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      next(new AppError('No tiene permisos para realizar esta operación.', 403, 'AUTH_FORBIDDEN'));

      return;
    }

    next();
  };
}

export const requireAuthenticatedUser = createRequireAuthenticatedUser();

export const requireEditor = requireRole(['ADMIN', 'EDITOR']);

export const requireAdmin = requireRole(['ADMIN']);
