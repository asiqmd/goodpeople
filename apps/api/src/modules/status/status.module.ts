import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import { JobHeartbeats } from './job-heartbeats.js';
import { OperationsService } from './operations.service.js';
import { StatusChecks } from './status-checks.service.js';
import { PlatformStatusController, StatusController } from './status.controller.js';
import { StatusProbes } from './status-probes.js';
import { StatusService } from './status.service.js';

/**
 * Phase 3 M5: the status page, its automated checks, incidents and maintenance, readiness
 * and backup runs. Global so the background jobs elsewhere can report their sweeps.
 */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [StatusController, PlatformStatusController],
  providers: [
    JobHeartbeats,
    StatusProbes,
    StatusService,
    OperationsService,
    StatusChecks,
    PlatformGuard,
  ],
  exports: [JobHeartbeats],
})
export class StatusModule {}
