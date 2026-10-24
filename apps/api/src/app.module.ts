import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { DbErrorFilter } from './common/db-error.filter.js';
import { TenantContextInterceptor } from './common/request-context.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DbModule } from './db/db.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EmployeesModule } from './modules/employees/employees.module.js';
import { HealthModule } from './modules/health/health.controller.js';
import { LeaveModule } from './modules/leave/leave.module.js';
import { OrgModule } from './modules/org/org.module.js';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module.js';
import { ReferenceModule } from './modules/reference/reference.controller.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        DbModule,
        AuthModule,
        HealthModule,
        ReferenceModule,
        PlatformAdminModule,
        TenancyModule,
        OrgModule,
        EmployeesModule,
        LeaveModule,
        AttendanceModule,
        ApprovalsModule,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
        { provide: APP_FILTER, useClass: DbErrorFilter },
      ],
      exports: [APP_CONFIG],
    };
  }
}
