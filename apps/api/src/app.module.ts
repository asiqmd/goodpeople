import { Module, type DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextInterceptor } from './common/request-context.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DbModule } from './db/db.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.controller.js';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [DbModule, AuthModule, HealthModule, PlatformAdminModule, TenancyModule],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
      ],
      exports: [APP_CONFIG],
    };
  }
}
