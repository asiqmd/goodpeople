import { Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service.js';
import { AccessStateGuard, FeatureGuard } from './guards.js';

@Module({
  providers: [EntitlementsService, AccessStateGuard, FeatureGuard],
  exports: [EntitlementsService, AccessStateGuard, FeatureGuard],
})
export class EntitlementsModule {}
