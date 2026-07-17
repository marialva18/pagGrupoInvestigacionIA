import express, { type Router } from 'express';
import {
  archiveNewsHandler,
  createNewsHandler,
  getNewsByIdHandler,
  listNewsHandler,
  updateNewsHandler,
} from './news.controller.js';

export const newsRouter: Router = express.Router();

newsRouter.get('/', listNewsHandler);
newsRouter.get('/:newsId', getNewsByIdHandler);
newsRouter.post('/', createNewsHandler);
newsRouter.patch('/:newsId', updateNewsHandler);
newsRouter.delete('/:newsId', archiveNewsHandler);
