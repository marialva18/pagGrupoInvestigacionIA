import express, { type Router } from 'express';
import {
  getPublicNewsHandler,
  listPublicAcademicSourcesHandler,
  listPublicMembersHandler,
  listPublicNewsHandler,
} from './public-content.controller.js';

export const publicContentRouter: Router = express.Router();

publicContentRouter.get('/news', listPublicNewsHandler);

publicContentRouter.get('/news/:slug', getPublicNewsHandler);

publicContentRouter.get('/members', listPublicMembersHandler);

publicContentRouter.get('/academic-sources', listPublicAcademicSourcesHandler);
