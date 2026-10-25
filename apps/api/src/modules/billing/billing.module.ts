import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersModule } from '../letters/letters.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import { BillingJobs } from './billing-jobs.service.js';
import { BillingPaymentsService } from './billing-payments.service.js';
import {
  BillingCallbacksController,
  BillingController,
  PlatformBillingController,
} from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { createGateways, GATEWAYS } from './gateways/index.js';

@Module({
  imports: [AuditModule, EntitlementsModule, NotificationsModule, LettersModule],
  controllers: [BillingController, PlatformBillingController, BillingCallbacksController],
  providers: [
    BillingService,
    BillingPaymentsService,
    BillingJobs,
    PlatformGuard,
    TenantRolesGuard,
    {
      provide: GATEWAYS,
      useFactory: (config: AppConfig) => createGateways(config),
      inject: [APP_CONFIG],
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
