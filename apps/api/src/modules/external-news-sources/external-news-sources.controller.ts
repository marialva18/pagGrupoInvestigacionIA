import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthenticatedUser } from '../auth/auth.middleware.js';
import {
  createExternalNewsSourceSchema,
  detectExternalNewsSourceSchema,
  externalNewsSourceIdParamsSchema,
  listExternalNewsSourcesQuerySchema,
  updateExternalNewsSourceSchema,
} from './external-news-sources.schema.js';
import {
  createExternalNewsSource,
  detectExternalNewsSource,
  listExternalNewsSources,
  removeExternalNewsSource,
  syncAllExternalNewsSources,
  syncExternalNewsSource,
  updateExternalNewsSource,
} from './external-news-sources.service.js';

export const listExternalNewsSourcesHandler: RequestHandler = (request, response, next) => {
  const parsed = listExternalNewsSourcesQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new AppError(
        'Los filtros de fuentes no son válidos.',
        400,
        'EXTERNAL_NEWS_SOURCE_INVALID_QUERY',
      ),
    );
    return;
  }

  void listExternalNewsSources(parsed.data)
    .then((result) => response.status(200).json({ data: result }))
    .catch(next);
};

export const detectExternalNewsSourceHandler: RequestHandler = (request, response, next) => {
  const parsed = detectExternalNewsSourceSchema.safeParse(request.body);

  if (!parsed.success) {
    next(
      new AppError(
        'Los datos para detectar la fuente no son válidos.',
        400,
        'EXTERNAL_NEWS_SOURCE_DETECTION_INVALID_INPUT',
      ),
    );
    return;
  }

  void detectExternalNewsSource(parsed.data)
    .then((result) => response.status(200).json({ data: result }))
    .catch(next);
};

export const createExternalNewsSourceHandler: RequestHandler = (request, response, next) => {
  const parsed = createExternalNewsSourceSchema.safeParse(request.body);

  if (!parsed.success) {
    next(
      new AppError(
        'Los datos de la fuente no son válidos.',
        400,
        'EXTERNAL_NEWS_SOURCE_INVALID_INPUT',
      ),
    );
    return;
  }

  void createExternalNewsSource(getAuthenticatedUser(request), parsed.data)
    .then((source) => response.status(201).json({ data: source }))
    .catch(next);
};

export const updateExternalNewsSourceHandler: RequestHandler = (request, response, next) => {
  const params = externalNewsSourceIdParamsSchema.safeParse(request.params);
  const body = updateExternalNewsSourceSchema.safeParse(request.body);

  if (!params.success) {
    next(
      new AppError(
        'El identificador de la fuente no es válido.',
        400,
        'EXTERNAL_NEWS_SOURCE_INVALID_ID',
      ),
    );
    return;
  }

  if (!body.success) {
    next(
      new AppError(
        'Los cambios de la fuente no son válidos.',
        400,
        'EXTERNAL_NEWS_SOURCE_INVALID_UPDATE',
      ),
    );
    return;
  }

  void updateExternalNewsSource(getAuthenticatedUser(request), params.data.sourceId, body.data)
    .then((source) => response.status(200).json({ data: source }))
    .catch(next);
};

export const removeExternalNewsSourceHandler: RequestHandler = (request, response, next) => {
  const parsed = externalNewsSourceIdParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new AppError(
        'El identificador de la fuente no es válido.',
        400,
        'EXTERNAL_NEWS_SOURCE_INVALID_ID',
      ),
    );
    return;
  }

  void removeExternalNewsSource(getAuthenticatedUser(request), parsed.data.sourceId)
    .then((result) => response.status(200).json({ data: result }))
    .catch(next);
};

export const syncExternalNewsSourceHandler: RequestHandler = (request, response, next) => {
  const parsed = externalNewsSourceIdParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new AppError(
        'El identificador de la fuente no es válido.',
        400,
        'EXTERNAL_NEWS_SOURCE_INVALID_ID',
      ),
    );
    return;
  }

  void syncExternalNewsSource(getAuthenticatedUser(request), parsed.data.sourceId)
    .then((result) => response.status(200).json({ data: result }))
    .catch(next);
};

export const syncAllExternalNewsSourcesHandler: RequestHandler = (request, response, next) => {
  void syncAllExternalNewsSources(getAuthenticatedUser(request))
    .then((result) => response.status(200).json({ data: result }))
    .catch(next);
};
