import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { BigIntInterceptor } from './common/bigint.interceptor';
import { HttpExceptionFilter } from './common/http-exception.filter';

/** Configuration HTTP commune à main.ts et aux tests e2e. */
export function configureApp(app: INestApplication): void {
  // Derrière le rewrite Next (même machine) : l'IP réelle vient de X-Forwarded-For.
  (app as NestExpressApplication).set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new BigIntInterceptor());
  app.enableShutdownHooks();
}
