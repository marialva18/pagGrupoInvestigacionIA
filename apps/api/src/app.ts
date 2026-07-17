import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { errorMiddleware } from './common/middlewares/error.middleware.js';
import { notFoundMiddleware } from './common/middlewares/not-found.middleware.js';
import { allowedOrigins } from './config/env.js';
import { apiV1Router } from './routes/index.js';

export const app: Express = express();

app.disable('x-powered-by');

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
  }),
);

app.use(compression());

app.use(
  express.json({
    limit: '1mb',
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '1mb',
  }),
);

app.use(
  pinoHttp({
    autoLogging: true,
    quietReqLogger: true,
    quietResLogger: false,
  }),
);

app.use(
  '/api/v1',
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
  apiV1Router,
);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
