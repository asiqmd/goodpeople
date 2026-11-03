import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { LettersModule } from '../letters/letters.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { UaeController } from './uae.controller.js';
import { UaeService } from './uae.service.js';
@Module({
  imports: [LettersModule, EntitlementsModule],
  controllers: [UaeController],
  providers: [UaeService, TenantRolesGuard],
})
export class UaeModule {}
