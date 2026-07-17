import express, { type Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { mediaRouter } from '../modules/media/media.routes.js';
import { newsRouter } from '../modules/news/news.routes.js';

export const apiV1Router: Router = express.Router();

apiV1Router.use('/health', healthRouter);
apiV1Router.use('/editor/media', mediaRouter);
apiV1Router.use('/editor/news', newsRouter);
