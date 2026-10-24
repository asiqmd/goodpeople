import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { TenancyController } from './tenancy.controller.js';
import { TenancyService } from './tenancy.service.js';

@Module({
  imports: [EntitlementsModule],
  controllers: [TenancyController],
  providers: [TenancyService],
})
export class TenancyModule {}
