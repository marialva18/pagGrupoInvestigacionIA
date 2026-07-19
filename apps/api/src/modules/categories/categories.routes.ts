import express, { type Router } from 'express';
import { listCategoriesHandler } from './categories.controller.js';

export const categoriesRouter: Router = express.Router();

categoriesRouter.get('/', listCategoriesHandler);
