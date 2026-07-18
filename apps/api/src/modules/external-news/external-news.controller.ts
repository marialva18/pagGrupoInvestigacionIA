import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthenticatedUser } from '../auth/auth.middleware.js';
import {
  discardExternalNewsItemSchema,
  externalNewsItemIdParamsSchema,
  importExternalNewsItemSchema,
  listExternalNewsItemsQuerySchema,
} from './external-news.schema.js';
import {
  discardExternalNewsItem,
  importExternalNewsItem,
  listExternalNewsItems,
} from './external-news.service.js';

export const listExternalNewsItemsHandler: RequestHandler = (request, response, next) => {
  const parsed = listExternalNewsItemsQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new AppError(
        'Los filtros de noticias externas no son válidos.',
        400,
        'EXTERNAL_NEWS_INVALID_QUERY',
      ),
    );
    return;
  }

  void listExternalNewsItems(parsed.data)
    .then((result) => response.status(200).json({ data: result }))
    .catch(next);
};

export const importExternalNewsItemHandler: RequestHandler = (request, response, next) => {
  const params = externalNewsItemIdParamsSchema.safeParse(request.params);
  const body = importExternalNewsItemSchema.safeParse(request.body);

  if (!params.success) {
    next(new AppError('El identificador no es válido.', 400, 'EXTERNAL_NEWS_INVALID_ID'));
    return;
  }

  if (!body.success) {
    next(
      new AppError(
        'Los datos de importación no son válidos.',
        400,
        'EXTERNAL_NEWS_IMPORT_INVALID_INPUT',
      ),
    );
    return;
  }

  void importExternalNewsItem(getAuthenticatedUser(request), params.data.itemId, body.data)
    .then((result) => response.status(201).json({ data: result }))
    .catch(next);
};

export const discardExternalNewsItemHandler: RequestHandler = (request, response, next) => {
  const params = externalNewsItemIdParamsSchema.safeParse(request.params);
  const body = discardExternalNewsItemSchema.safeParse(request.body ?? {});

  if (!params.success) {
    next(new AppError('El identificador no es válido.', 400, 'EXTERNAL_NEWS_INVALID_ID'));
    return;
  }

  if (!body.success) {
    next(
      new AppError(
        'Los datos para descartar no son válidos.',
        400,
        'EXTERNAL_NEWS_DISCARD_INVALID_INPUT',
      ),
    );
    return;
  }

  void discardExternalNewsItem(getAuthenticatedUser(request), params.data.itemId, body.data)
    .then((result) => response.status(200).json({ data: result }))
    .catch(next);
};
