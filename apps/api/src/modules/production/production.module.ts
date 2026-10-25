import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { OperationsService } from './operations.service.js';
import { ProductionController } from './production.controller.js';
import { ProductionEntriesService } from './production-entries.service.js';
import { ProductionSummaryService } from './production-summary.service.js';

// Phase 3 M3 (the RMG pack): piece rates, production incentives and daily production.
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [ProductionController],
  providers: [
    OperationsService,
    ProductionEntriesService,
    ProductionSummaryService,
    TenantRolesGuard,
  ],
})
export class ProductionModule {}
