import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { publicNewsListQuerySchema, publicNewsSlugParamsSchema } from './public-content.schema.js';
import {
  getPublicNewsBySlug,
  listPublicAcademicSources,
  listPublicMembers,
  listPublicNews,
} from './public-content.service.js';

export const listPublicNewsHandler: RequestHandler = (request, response, next) => {
  const parsed = publicNewsListQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(new AppError('Los filtros de noticias no son válidos.', 400, 'PUBLIC_NEWS_INVALID_QUERY'));

    return;
  }

  void listPublicNews(parsed.data)
    .then((result) => {
      response.status(200).json({
        data: result,
      });
    })
    .catch(next);
};

export const getPublicNewsHandler: RequestHandler = (request, response, next) => {
  const parsed = publicNewsSlugParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(new AppError('El slug de la noticia no es válido.', 400, 'PUBLIC_NEWS_INVALID_SLUG'));

    return;
  }

  void getPublicNewsBySlug(parsed.data.slug)
    .then((news) => {
      response.status(200).json({
        data: news,
      });
    })
    .catch(next);
};

export const listPublicMembersHandler: RequestHandler = (_request, response, next) => {
  void listPublicMembers()
    .then((members) => {
      response.status(200).json({
        data: members,
      });
    })
    .catch(next);
};

export const listPublicAcademicSourcesHandler: RequestHandler = (_request, response, next) => {
  void listPublicAcademicSources()
    .then((sources) => {
      response.status(200).json({
        data: sources,
      });
    })
    .catch(next);
};
