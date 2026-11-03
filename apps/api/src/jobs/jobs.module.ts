import { EntitlementsModule } from '../modules/entitlements/entitlements.module.js';
import { Global, Module } from '@nestjs/common';
import { DurableJobs } from './durable-jobs.js';
import { ScheduledWorker } from './scheduled-worker.js';
@Global()
@Module({
  imports: [EntitlementsModule],
  providers: [DurableJobs, ScheduledWorker],
  exports: [DurableJobs, ScheduledWorker],
})
export class JobsModule {}
