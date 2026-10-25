import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import { PlatformSignupsController, SignupController } from './signup.controller.js';
import { SignupService } from './signup.service.js';

@Module({
  imports: [AuditModule, AuthModule, NotificationsModule],
  controllers: [SignupController, PlatformSignupsController],
  providers: [SignupService, PlatformGuard],
})
export class SignupModule {}
