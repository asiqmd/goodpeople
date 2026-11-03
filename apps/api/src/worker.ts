import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { ScheduledWorker } from './jobs/scheduled-worker.js';
import { AppLogger } from './common/logger.js';
export async function createWorker(overrides: NonNullable<Parameters<typeof loadConfig>[0]> = {}) {
  const config = loadConfig({ ...overrides, PROCESS_ROLE: 'worker' });
  return NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: new AppLogger({ format: config.LOG_FORMAT, level: config.LOG_LEVEL }),
  });
}
// Imported by tests without starting a process.
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const worker = await createWorker();
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await worker.get(ScheduledWorker).stop();
    await worker.close();
  };
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
}
