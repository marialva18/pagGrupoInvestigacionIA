import express, { type Router } from 'express';
import {
  createExternalNewsSourceHandler,
  detectExternalNewsSourceHandler,
  listExternalNewsSourcesHandler,
  removeExternalNewsSourceHandler,
  syncAllExternalNewsSourcesHandler,
  syncExternalNewsSourceHandler,
  updateExternalNewsSourceHandler,
} from './external-news-sources.controller.js';

export const externalNewsSourcesRouter: Router = express.Router();

externalNewsSourcesRouter.get('/', listExternalNewsSourcesHandler);
externalNewsSourcesRouter.post('/detect', detectExternalNewsSourceHandler);
externalNewsSourcesRouter.post('/', createExternalNewsSourceHandler);
externalNewsSourcesRouter.post('/sync', syncAllExternalNewsSourcesHandler);
externalNewsSourcesRouter.patch('/:sourceId', updateExternalNewsSourceHandler);
externalNewsSourcesRouter.delete('/:sourceId', removeExternalNewsSourceHandler);
externalNewsSourcesRouter.post('/:sourceId/sync', syncExternalNewsSourceHandler);
