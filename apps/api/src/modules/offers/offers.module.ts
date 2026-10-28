import { Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limit.js';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EmployeesModule } from '../employees/employees.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { OfferHireService } from './offer-hire.service.js';
import { OfferJobs } from './offer-jobs.service.js';
import { OfferLetterService } from './offer-letter.service.js';
import { OfferPublicController } from './offer-public.controller.js';
import { OfferPublicService } from './offer-public.service.js';
import { OffersController } from './offers.controller.js';
import { OffersService } from './offers.service.js';

// Phase 4 M1: offers, their approval and letters, acceptance online, and hiring. The approvals
// module decides offers above budget, so this one must not import it.
@Module({
  imports: [
    AuditModule,
    EntitlementsModule,
    LettersModule,
    DocumentsModule,
    EmployeesModule,
    PayrollModule,
  ],
  controllers: [OffersController, OfferPublicController],
  providers: [
    OffersService,
    OfferPublicService,
    OfferHireService,
    OfferLetterService,
    OfferJobs,
    RateLimiter,
    TenantRolesGuard,
  ],
  exports: [OffersService],
})
export class OffersModule {}
