import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { TenancyController } from './tenancy.controller.js';

@Module({
  imports: [EntitlementsModule],
  controllers: [TenancyController],
})
export class TenancyModule {}
