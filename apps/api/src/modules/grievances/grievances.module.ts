import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { PinLockout } from './codes.js';
import { GrievanceAccessGuard } from './grievance-access.guard.js';
import { GrievancesController } from './grievances.controller.js';
import { GrievancesService } from './grievances.service.js';
import { SpeakUpController } from './speak-up.controller.js';
import { SpeakUpService } from './speak-up.service.js';

/** Workers' grievances: raised and followed up without signing in, answered by staff. */
@Module({
  imports: [AuditModule, AuthModule, EntitlementsModule],
  controllers: [SpeakUpController, GrievancesController],
  providers: [
    GrievancesService,
    SpeakUpService,
    PinLockout,
    TenantRolesGuard,
    GrievanceAccessGuard,
  ],
})
export class GrievancesModule {}
