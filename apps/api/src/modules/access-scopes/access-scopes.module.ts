import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { AccessScopesController } from './access-scopes.controller.js';
import { AccessScopesService } from './access-scopes.service.js';

// Phase 3 M4 (the group pack: the companies a shared-service HR login may see).
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [AccessScopesController],
  providers: [AccessScopesService, TenantRolesGuard],
})
export class AccessScopesModule {}
