import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config.js';

export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), {
    cors: { origin: config.WEB_ORIGIN },
    logger: process.env.NODE_ENV === 'test' ? ['error'] : undefined,
  });
  app.enableShutdownHooks();
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
