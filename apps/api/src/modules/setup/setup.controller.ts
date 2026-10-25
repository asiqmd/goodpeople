import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SetupChecklist, TenantWithAccess } from '@gp/shared';
import { CurrentTenant } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { AccessStateGuard } from '../entitlements/guards.js';
import { SetupService } from './setup.service.js';

@ApiTags('setup')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Controller('tenant/setup-checklist')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  /** What the workspace still needs before go-live. */
  @Get()
  @Permits('org.manage')
  checklist(@CurrentTenant() tenant: TenantWithAccess): Promise<SetupChecklist> {
    return this.setup.checklist(tenant);
  }
}
