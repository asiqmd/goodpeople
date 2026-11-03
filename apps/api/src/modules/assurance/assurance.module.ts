import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformGuard } from '../platform-admin/platform.guard.js';
import { AssuranceController } from './assurance.controller.js';
import { AssuranceService } from './assurance.service.js';
@Module({
  imports: [AuthModule],
  controllers: [AssuranceController],
  providers: [AssuranceService, PlatformGuard],
})
export class AssuranceModule {}
