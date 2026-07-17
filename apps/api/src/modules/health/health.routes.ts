import express, { type Router } from 'express';

export const healthRouter: Router = express.Router();

healthRouter.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'intgarti-api',
    timestamp: new Date().toISOString(),
  });
});
