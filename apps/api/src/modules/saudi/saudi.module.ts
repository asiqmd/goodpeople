import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { LettersModule } from '../letters/letters.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { SaudiController } from './saudi.controller.js';
import { SaudiService } from './saudi.service.js';
@Module({
  imports: [LettersModule, EntitlementsModule],
  controllers: [SaudiController],
  providers: [SaudiService, TenantRolesGuard],
})
export class SaudiModule {}
