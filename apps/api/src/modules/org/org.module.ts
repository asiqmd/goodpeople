import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { OrgController } from './org.controller.js';
import { OrgService } from './org.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [OrgController],
  providers: [OrgService, TenantRolesGuard],
  exports: [OrgService],
})
export class OrgModule {}
