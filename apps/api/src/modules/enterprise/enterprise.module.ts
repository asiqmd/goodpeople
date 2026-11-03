import { AuthModule } from '../auth/auth.module.js';
import { PlacementsService } from './placements.service.js';
import { PlacementsController, PlacementRouteController } from './placements.controller.js';
import { Module } from '@nestjs/common';
import { EnterpriseLicenseService } from './enterprise-license.service.js';
import { EnterpriseController, InstallationController } from './enterprise.controller.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
@Module({
  imports: [EntitlementsModule, AuthModule],
  providers: [EnterpriseLicenseService, PlacementsService],
  controllers: [
    EnterpriseController,
    InstallationController,
    PlacementsController,
    PlacementRouteController,
  ],
  exports: [EnterpriseLicenseService],
})
export class EnterpriseModule {}
