import express, { type Router } from 'express';
import {
  archiveNewsHandler,
  createNewsHandler,
  getNewsByIdHandler,
  listNewsHandler,
  listNewsRevisionsHandler,
  publishNewsHandler,
  restoreNewsHandler,
  unpublishNewsHandler,
  updateNewsHandler,
} from './news.controller.js';

export const newsRouter: Router = express.Router();

newsRouter.get('/', listNewsHandler);
newsRouter.get('/:newsId/revisions', listNewsRevisionsHandler);

newsRouter.get('/:newsId', getNewsByIdHandler);
newsRouter.post('/', createNewsHandler);
newsRouter.post('/:newsId/restore', restoreNewsHandler);
newsRouter.post('/:newsId/publish', publishNewsHandler);
newsRouter.post('/:newsId/unpublish', unpublishNewsHandler);
newsRouter.patch('/:newsId', updateNewsHandler);
newsRouter.delete('/:newsId', archiveNewsHandler);
