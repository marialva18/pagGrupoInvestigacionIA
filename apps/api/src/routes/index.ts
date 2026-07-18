import express, { type Router } from 'express';
import { env } from '../config/env.js';
import { createRequireAuthenticatedUser, requireEditor } from '../modules/auth/auth.middleware.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { authenticateAccessToken as defaultAuthenticateAccessToken } from '../modules/auth/auth.service.js';
import type { AuthenticateAccessToken } from '../modules/auth/auth.types.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { mediaRouter } from '../modules/media/media.routes.js';
import { newsRouter } from '../modules/news/news.routes.js';

export interface ApiV1RouterOptions {
  enableEditorRoutes?: boolean;
  authenticateAccessToken?: AuthenticateAccessToken;
}

export function createApiV1Router(options: ApiV1RouterOptions = {}): Router {
  const router = express.Router();

  const enableEditorRoutes = options.enableEditorRoutes ?? env.ENABLE_EDITOR_ROUTES;

  const authenticate = options.authenticateAccessToken ?? defaultAuthenticateAccessToken;

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter(authenticate));

  if (enableEditorRoutes) {
    const requireAuthentication = createRequireAuthenticatedUser(authenticate);

    router.use('/editor/media', requireAuthentication, requireEditor, mediaRouter);

    router.use('/editor/news', requireAuthentication, requireEditor, newsRouter);
  }

  return router;
}

export const apiV1Router: Router = createApiV1Router();
