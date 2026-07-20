import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthenticatedUser } from '../auth/auth.middleware.js';
import {
  archiveNewsSchema,
  createNewsSchema,
  listNewsQuerySchema,
  newsIdParamsSchema,
  publishNewsSchema,
  restoreNewsSchema,
  setNewsFeaturedSchema,
  unpublishNewsSchema,
  updateNewsSchema,
} from './news.schema.js';
import {
  archiveNews,
  createNews,
  getNewsById,
  listNews,
  listNewsRevisions,
  publishNews,
  restoreNews,
  setNewsFeatured,
  unpublishNews,
  updateNews,
} from './news.service.js';

export const createNewsHandler: RequestHandler = (request, response, next) => {
  const parsed = createNewsSchema.safeParse(request.body);

  if (!parsed.success) {
    next(new AppError('Los datos de la noticia no son válidos.', 400, 'NEWS_INVALID_INPUT'));

    return;
  }

  void createNews(getAuthenticatedUser(request), parsed.data)
    .then((news) => {
      response.status(201).json({
        data: news,
      });
    })
    .catch(next);
};

export const listNewsHandler: RequestHandler = (request, response, next) => {
  const parsed = listNewsQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new AppError(
        'Los filtros para listar noticias no son válidos.',
        400,
        'NEWS_LIST_INVALID_QUERY',
      ),
    );

    return;
  }

  void listNews(getAuthenticatedUser(request), parsed.data)
    .then((result) => {
      response.status(200).json({
        data: result,
      });
    })
    .catch(next);
};

export const getNewsByIdHandler: RequestHandler = (request, response, next) => {
  const parsed = newsIdParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));

    return;
  }

  void getNewsById(getAuthenticatedUser(request), parsed.data.newsId)
    .then((news) => {
      response.status(200).json({
        data: news,
      });
    })
    .catch(next);
};

export const updateNewsHandler: RequestHandler = (request, response, next) => {
  const parsedParams = newsIdParamsSchema.safeParse(request.params);

  if (!parsedParams.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));

    return;
  }

  const parsedBody = updateNewsSchema.safeParse(request.body);

  if (!parsedBody.success) {
    next(
      new AppError(
        'Los datos para actualizar la noticia no son válidos.',
        400,
        'NEWS_UPDATE_INVALID_INPUT',
      ),
    );

    return;
  }

  void updateNews(getAuthenticatedUser(request), parsedParams.data.newsId, parsedBody.data)
    .then((news) => {
      response.status(200).json({
        data: news,
      });
    })
    .catch(next);
};

export const archiveNewsHandler: RequestHandler = (request, response, next) => {
  const parsedParams = newsIdParamsSchema.safeParse(request.params);

  if (!parsedParams.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));

    return;
  }

  const parsedBody = archiveNewsSchema.safeParse(request.body);

  if (!parsedBody.success) {
    next(
      new AppError(
        'Los datos para archivar la noticia no son válidos.',
        400,
        'NEWS_ARCHIVE_INVALID_INPUT',
      ),
    );

    return;
  }

  void archiveNews(getAuthenticatedUser(request), parsedParams.data.newsId, parsedBody.data)
    .then((news) => {
      response.status(200).json({
        data: news,
      });
    })
    .catch(next);
};

export const restoreNewsHandler: RequestHandler = (request, response, next) => {
  const parsedParams = newsIdParamsSchema.safeParse(request.params);

  if (!parsedParams.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));

    return;
  }

  const parsedBody = restoreNewsSchema.safeParse(request.body);

  if (!parsedBody.success) {
    next(
      new AppError(
        'Los datos para restaurar la noticia no son válidos.',
        400,
        'NEWS_RESTORE_INVALID_INPUT',
      ),
    );

    return;
  }

  void restoreNews(getAuthenticatedUser(request), parsedParams.data.newsId, parsedBody.data)
    .then((news) => {
      response.status(200).json({
        data: news,
      });
    })
    .catch(next);
};

export const listNewsRevisionsHandler: RequestHandler = (request, response, next) => {
  const parsed = newsIdParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));

    return;
  }

  void listNewsRevisions(getAuthenticatedUser(request), parsed.data.newsId)
    .then((result) => {
      response.status(200).json({
        data: result,
      });
    })
    .catch(next);
};

export const publishNewsHandler: RequestHandler = (request, response, next) => {
  const parsedParams = newsIdParamsSchema.safeParse(request.params);
  const parsedBody = publishNewsSchema.safeParse(request.body ?? {});

  if (!parsedParams.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));
    return;
  }

  if (!parsedBody.success) {
    next(
      new AppError('Los datos de publicación no son válidos.', 400, 'NEWS_PUBLISH_INVALID_INPUT'),
    );
    return;
  }

  void publishNews(getAuthenticatedUser(request), parsedParams.data.newsId, parsedBody.data)
    .then((news) => response.status(200).json({ data: news }))
    .catch(next);
};

export const unpublishNewsHandler: RequestHandler = (request, response, next) => {
  const parsedParams = newsIdParamsSchema.safeParse(request.params);
  const parsedBody = unpublishNewsSchema.safeParse(request.body);

  if (!parsedParams.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));
    return;
  }

  if (!parsedBody.success) {
    next(
      new AppError(
        'Los datos para despublicar la noticia no son válidos.',
        400,
        'NEWS_UNPUBLISH_INVALID_INPUT',
      ),
    );
    return;
  }

  void unpublishNews(getAuthenticatedUser(request), parsedParams.data.newsId, parsedBody.data)
    .then((news) => response.status(200).json({ data: news }))
    .catch(next);
};

export const setNewsFeaturedHandler: RequestHandler = (request, response, next) => {
  const parsedParams = newsIdParamsSchema.safeParse(request.params);
  const parsedBody = setNewsFeaturedSchema.safeParse(request.body);

  if (!parsedParams.success) {
    next(new AppError('El identificador de la noticia no es válido.', 400, 'NEWS_INVALID_ID'));
    return;
  }

  if (!parsedBody.success) {
    next(new AppError('El estado destacado no es válido.', 400, 'NEWS_FEATURED_INVALID_INPUT'));
    return;
  }

  void setNewsFeatured(getAuthenticatedUser(request), parsedParams.data.newsId, parsedBody.data)
    .then((news) => response.status(200).json({ data: news }))
    .catch(next);
};
