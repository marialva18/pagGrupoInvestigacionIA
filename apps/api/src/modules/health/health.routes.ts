import express, { type Router } from 'express';
import { sendSuccess } from '../../common/http/http-response.js';

export const healthRouter: Router = express.Router();

healthRouter.get('/', (_request, response) => {
  sendSuccess(response, 200, {
    status: 'ok',
    service: 'intgarti-api',
    timestamp: new Date().toISOString(),
  });
});
