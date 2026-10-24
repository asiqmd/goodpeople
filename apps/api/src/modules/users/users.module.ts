import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuditModule, AuthModule, EntitlementsModule],
  controllers: [UsersController],
  providers: [UsersService, TenantRolesGuard],
})
export class UsersModule {}
