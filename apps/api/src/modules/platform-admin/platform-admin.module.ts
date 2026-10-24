import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformGuard } from './platform.guard.js';

@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformGuard],
})
export class PlatformAdminModule {}
