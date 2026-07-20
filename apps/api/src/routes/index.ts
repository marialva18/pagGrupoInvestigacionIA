import express, { type Router } from 'express';
import { adminUsersRouter } from '../modules/admin-users/admin-users.routes.js';
import { env } from '../config/env.js';
import {
  createRequireAuthenticatedUser,
  requireAdmin,
  requireEditor,
} from '../modules/auth/auth.middleware.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { authenticateAccessToken as defaultAuthenticateAccessToken } from '../modules/auth/auth.service.js';
import type { AuthenticateAccessToken } from '../modules/auth/auth.types.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { externalNewsRouter } from '../modules/external-news/external-news.routes.js';
import { externalNewsSourcesRouter } from '../modules/external-news-sources/external-news-sources.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { mediaRouter } from '../modules/media/media.routes.js';
import { membersRouter } from '../modules/members/members.routes.js';
import { newsRouter } from '../modules/news/news.routes.js';
import { publicContentRouter } from '../modules/public-content/public-content.routes.js';
import { institutionRouter } from '../modules/institution/institution.routes.js';
import { getInstitutionHandler } from '../modules/institution/institution.controller.js';

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
  router.use('/public', publicContentRouter);
  router.get('/public/institution', getInstitutionHandler);

  if (enableEditorRoutes) {
    const requireAuthentication = createRequireAuthenticatedUser(authenticate);

    router.use('/admin/users', requireAuthentication, requireAdmin, adminUsersRouter);

    router.use('/editor/categories', requireAuthentication, requireEditor, categoriesRouter);
    router.use(
      '/editor/news-sources',
      requireAuthentication,
      requireEditor,
      externalNewsSourcesRouter,
    );
    router.use('/editor/external-news', requireAuthentication, requireEditor, externalNewsRouter);
    router.use('/editor/media', requireAuthentication, requireEditor, mediaRouter);
    router.use('/editor/members', requireAuthentication, requireEditor, membersRouter);
    router.use('/editor/news', requireAuthentication, requireEditor, newsRouter);
    router.use('/editor/institution', requireAuthentication, requireEditor, institutionRouter);
  }

  return router;
}

export const apiV1Router: Router = createApiV1Router();
