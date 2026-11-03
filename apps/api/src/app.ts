import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AppLogger } from './common/logger.js';
import { requestTracking } from './common/request-id.js';
import type { AppConfig } from './config.js';

export async function createApp(config: AppConfig): Promise<INestApplication> {
  const logger = new AppLogger({ format: config.LOG_FORMAT, level: config.LOG_LEVEL });
  const app = await NestFactory.create(AppModule.forRoot(config), {
    bodyParser: false,
    cors: { origin: config.WEB_ORIGIN },
    logger,
  });
  app.enableShutdownHooks();
  app.use(requestTracking(logger));
  // Headers for every response: no sniffing, no referrer, never framed, same-site reads only.
  const always = {
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  } as const;
  // The API serves JSON and files only, so the strictest policy fits; /docs needs its scripts.
  const strict = helmet({
    ...always,
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  const docs = helmet({
    ...always,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith('/docs') ? docs : strict)(req, res, next),
  );
  app.use(json({ type: ['application/json', 'application/scim+json'], limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  if (config.TRUST_PROXY > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', config.TRUST_PROXY);
  }
  // The map of every route: for developers, so production serves it only with API_DOCS=on.
  if (config.API_DOCS) SwaggerModule.setup('docs', app, buildOpenApi(app));
  return app;
}

/** Served at /docs and /docs-json; `pnpm --filter @gp/api openapi` writes it to openapi.json. */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Good People API')
    .setDescription('Multi-tenant HR and payroll platform. Phase 0: tenancy, auth, entitlements.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
