import express, { type Router } from 'express';
import { createNewsHandler, getNewsByIdHandler, listNewsHandler } from './news.controller.js';

export const newsRouter: Router = express.Router();

newsRouter.get('/', listNewsHandler);
newsRouter.get('/:newsId', getNewsByIdHandler);
newsRouter.post('/', createNewsHandler);
