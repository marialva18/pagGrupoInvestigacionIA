import express, { type Router } from 'express';
import { createRequireAuthenticatedUser } from './auth.middleware.js';
import { getSessionHandler } from './auth.controller.js';
import { authenticateAccessToken } from './auth.service.js';
import type { AuthenticateAccessToken } from './auth.types.js';

export function createAuthRouter(
  authenticate: AuthenticateAccessToken = authenticateAccessToken,
): Router {
  const router = express.Router();

  router.get('/session', createRequireAuthenticatedUser(authenticate), getSessionHandler);

  return router;
}

export const authRouter = createAuthRouter();
