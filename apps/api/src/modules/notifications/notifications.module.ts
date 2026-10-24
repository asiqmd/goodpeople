import { Global, Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { NotificationAdminService } from './notification-admin.service.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { NotificationJobs } from './notification-jobs.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { createSenders, EMAIL_SENDER, PUSH_SENDER, SMS_SENDER } from './senders.js';

const SENDERS = Symbol('SENDERS');

/** Global: approvals, letters and sign-in tell people things from their own modules. */
@Global()
@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: SENDERS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createSenders(config),
    },
    {
      provide: EMAIL_SENDER,
      inject: [SENDERS],
      useFactory: (s: ReturnType<typeof createSenders>) => s.email,
    },
    {
      provide: SMS_SENDER,
      inject: [SENDERS],
      useFactory: (s: ReturnType<typeof createSenders>) => s.sms,
    },
    {
      provide: PUSH_SENDER,
      inject: [SENDERS],
      useFactory: (s: ReturnType<typeof createSenders>) => s.push,
    },
    NotificationsService,
    NotificationDispatcher,
    NotificationAdminService,
    NotificationJobs,
    TenantRolesGuard,
  ],
  exports: [
    NotificationsService,
    NotificationDispatcher,
    NotificationJobs,
    EMAIL_SENDER,
    SMS_SENDER,
    PUSH_SENDER,
  ],
})
export class NotificationsModule {}
