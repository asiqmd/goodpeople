import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { AllocationsService } from './allocations.service.js';
import { ProjectCostsService } from './project-costs.service.js';
import { ProjectSharesService } from './project-shares.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

// Phase 3 M4 (the NGO pack: donors, projects, salary splits, the journal split and donor reports).
// Payroll imports this module for the shares; it must not import payroll's module back.
@Module({
  imports: [AuditModule, EntitlementsModule, LettersModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    AllocationsService,
    ProjectCostsService,
    ProjectSharesService,
    TenantRolesGuard,
  ],
  exports: [ProjectSharesService],
})
export class ProjectsModule {}
