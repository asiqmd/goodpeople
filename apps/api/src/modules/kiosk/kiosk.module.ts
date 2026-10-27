import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RateLimiter } from '../../common/rate-limit.js';
import { TenantRolesGuard } from '../../common/roles.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LeaveModule } from '../leave/leave.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { KioskAuthService } from './kiosk-auth.service.js';
import { KioskDeviceController, KiosksController } from './kiosk.controller.js';
import { KioskGuard, KioskSessionGuard } from './kiosk.guard.js';
import { EndedSessions, KioskPause, PinLockout } from './kiosk-state.js';
import { KioskWorkerService } from './kiosk-worker.service.js';
import { KiosksService } from './kiosks.service.js';

// Shared tablets at a factory: workers sign in with their ID card's code and a PIN.
@Module({
  imports: [
    AttendanceModule,
    AuditModule,
    EntitlementsModule,
    LeaveModule,
    PayrollModule,
    // Kiosk sessions are signed like access tokens, typed so neither passes for the other.
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ secret: config.JWT_ACCESS_SECRET }),
    }),
  ],
  controllers: [KiosksController, KioskDeviceController],
  providers: [
    KiosksService,
    KioskAuthService,
    KioskWorkerService,
    KioskGuard,
    KioskSessionGuard,
    PinLockout,
    KioskPause,
    EndedSessions,
    RateLimiter,
    TenantRolesGuard,
  ],
})
export class KioskModule {}
