import express, { type Router } from 'express';
import {
  discardExternalNewsItemHandler,
  importExternalNewsItemHandler,
  listExternalNewsItemsHandler,
} from './external-news.controller.js';

export const externalNewsRouter: Router = express.Router();

externalNewsRouter.get('/', listExternalNewsItemsHandler);
externalNewsRouter.post('/:itemId/import', importExternalNewsItemHandler);
externalNewsRouter.post('/:itemId/discard', discardExternalNewsItemHandler);
