import { CommercialController } from './commercial.controller.js';
import { AuditModule } from '../audit/audit.module.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import { LettersModule } from '../letters/letters.module.js';
import { Module } from '@nestjs/common';
import { InternationalController } from './international.controller.js';
import { InternationalService } from './international.service.js';
import { OrgModule } from '../org/org.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { TenantRolesGuard } from '../../common/roles.js';
@Module({
  imports: [AuditModule, OrgModule, EntitlementsModule, LettersModule],
  controllers: [InternationalController, CommercialController],
  providers: [PlatformGuard, InternationalService, TenantRolesGuard],
})
export class InternationalModule {}
