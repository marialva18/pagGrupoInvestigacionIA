import express, { type Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';

export const apiV1Router: Router = express.Router();

apiV1Router.use('/health', healthRouter);
