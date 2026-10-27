import { Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limit.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import { SupportJobs } from './support-jobs.service.js';
import {
  PlatformSupportController,
  SupportController,
  SupportRequesterGuard,
} from './support.controller.js';
import { SupportService } from './support.service.js';

// Phase 3 M5: support tickets between a workspace and Good People.
@Module({
  imports: [AuditModule, EntitlementsModule, NotificationsModule],
  controllers: [SupportController, PlatformSupportController],
  providers: [SupportService, SupportJobs, SupportRequesterGuard, PlatformGuard, RateLimiter],
})
export class SupportModule {}
