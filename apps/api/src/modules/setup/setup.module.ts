import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { SetupController } from './setup.controller.js';
import { SetupService } from './setup.service.js';

@Module({
  imports: [EntitlementsModule],
  controllers: [SetupController],
  providers: [SetupService, TenantRolesGuard],
})
export class SetupModule {}
