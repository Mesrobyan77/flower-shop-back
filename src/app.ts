import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middlewares/error';
import { apiLimiter } from './middlewares/rateLimit';
import routes from './routes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  // Flat-string query params only: object/array params (the MongoDB operator
  // injection vector) never reach controllers, validated routes or not.
  app.set('query parser', 'simple');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  if (!env.isProd) app.use(morgan('dev'));

  app.use(env.API_PREFIX, apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
