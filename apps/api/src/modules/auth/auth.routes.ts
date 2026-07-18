import express, { type Router } from 'express';
import {
  activateInvitationHandler,
  getSessionHandler,
  requestPasswordRecoveryHandler,
} from './auth.controller.js';
import { createRequireAuthenticatedUser } from './auth.middleware.js';
import { authenticateAccessToken } from './auth.service.js';
import type { AuthenticateAccessToken } from './auth.types.js';

export function createAuthRouter(
  authenticate: AuthenticateAccessToken = authenticateAccessToken,
): Router {
  const router = express.Router();

  router.post('/password-recovery', requestPasswordRecoveryHandler);
  router.post('/activate-invitation', activateInvitationHandler);

  router.get('/session', createRequireAuthenticatedUser(authenticate), getSessionHandler);

  return router;
}

export const authRouter = createAuthRouter();
