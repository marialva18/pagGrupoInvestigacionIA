import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { AppError } from './common/errors/app-error.js';
import { errorMiddleware } from './common/middlewares/error.middleware.js';
import { notFoundMiddleware } from './common/middlewares/not-found.middleware.js';
import { allowedOrigins } from './config/env.js';
import { createApiV1Router, type ApiV1RouterOptions } from './routes/index.js';

export function createApp(options: ApiV1RouterOptions = {}): Express {
  const application = express();

  application.disable('x-powered-by');

  application.use(helmet());

  application.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new AppError('Origen no autorizado.', 403, 'CORS_ORIGIN_DENIED'));
      },
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      optionsSuccessStatus: 204,
    }),
  );

  application.use(compression());

  application.use(
    express.json({
      limit: '1mb',
    }),
  );

  application.use(
    express.urlencoded({
      extended: false,
      limit: '1mb',
    }),
  );

  application.use(
    pinoHttp({
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      genReqId(request, response) {
        const incomingRequestId = request.headers['x-request-id'];

        const requestId =
          typeof incomingRequestId === 'string' &&
          /^[A-Za-z0-9._:-]{1,100}$/.test(incomingRequestId)
            ? incomingRequestId
            : randomUUID();

        response.setHeader('x-request-id', requestId);

        return requestId;
      },
      autoLogging: true,
      quietReqLogger: true,
      quietResLogger: false,
    }),
  );

  application.use(
    '/api/v1',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    createApiV1Router(options),
  );

  application.use(notFoundMiddleware);
  application.use(errorMiddleware);

  return application;
}

export const app: Express = createApp();
