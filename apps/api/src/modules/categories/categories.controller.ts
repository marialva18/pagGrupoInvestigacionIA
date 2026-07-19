import type { RequestHandler } from 'express';
import { listActiveCategories } from './categories.service.js';

export const listCategoriesHandler: RequestHandler = (_request, response, next) => {
  void listActiveCategories()
    .then((data) => {
      response.status(200).json({
        data,
      });
    })
    .catch(next);
};
