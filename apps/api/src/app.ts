import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config.js';

export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), {
    cors: { origin: config.WEB_ORIGIN },
    logger: process.env.NODE_ENV === 'test' ? ['error'] : undefined,
  });
  app.enableShutdownHooks();
  // The API serves JSON and files only, so the strictest policy fits; /docs needs its scripts.
  const strict = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  const docs = helmet({
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
  if (config.TRUST_PROXY > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', config.TRUST_PROXY);
  }
  SwaggerModule.setup('docs', app, buildOpenApi(app));
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
