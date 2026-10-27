import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import {
  PlatformSupportAccessController,
  SupportAccessController,
} from './support-access.controller.js';
import { SupportAccessService } from './support-access.service.js';
import { SupportAuditMiddleware } from './support-audit.middleware.js';
import { SupportSessionInterceptor } from './support-session.interceptor.js';

// Phase 3 M5: read-only access a workspace grants Good People support.
@Module({
  imports: [AuditModule, AuthModule, EntitlementsModule],
  controllers: [SupportAccessController, PlatformSupportAccessController],
  providers: [
    SupportAccessService,
    PlatformGuard,
    TenantRolesGuard,
    { provide: APP_INTERCEPTOR, useClass: SupportSessionInterceptor },
  ],
})
export class SupportAccessModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SupportAuditMiddleware).forRoutes('{*path}');
  }
}
