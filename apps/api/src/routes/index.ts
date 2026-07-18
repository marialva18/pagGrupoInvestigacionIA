import express, { type Router } from 'express';
import { env } from '../config/env.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { mediaRouter } from '../modules/media/media.routes.js';
import { newsRouter } from '../modules/news/news.routes.js';

export interface ApiV1RouterOptions {
  enableEditorRoutes?: boolean;
}

export function createApiV1Router(options: ApiV1RouterOptions = {}): Router {
  const router = express.Router();
  const enableEditorRoutes = options.enableEditorRoutes ?? env.ENABLE_EDITOR_ROUTES;

  router.use('/health', healthRouter);
  router.use('/auth', authRouter);

  if (enableEditorRoutes) {
    router.use('/editor/media', mediaRouter);
    router.use('/editor/news', newsRouter);
  }

  return router;
}

export const apiV1Router: Router = createApiV1Router();
