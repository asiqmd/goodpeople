import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  type StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  kioskInputSchema,
  kioskPayslipQuerySchema,
  kioskPinRequestSchema,
  kioskPinSetSchema,
  kioskSignInSchema,
  leaveRequestInputSchema,
  type KioskCreated,
  type KioskDeviceView,
  type KioskInput,
  type KioskMeView,
  type KioskPinRequestInput,
  type KioskPinRequestResult,
  type KioskPinSetInput,
  type KioskSession,
  type KioskSignInInput,
  type KioskView,
  type LeaveRequestInput,
  type LeaveRequestView,
  type TenantWithAccess,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { KioskAuthService, type KioskWorker } from './kiosk-auth.service.js';
import {
  CurrentKiosk,
  CurrentWorker,
  KioskGuard,
  KioskSessionGuard,
  ReadsOnly,
} from './kiosk.guard.js';
import { KiosksService, type KioskIdentity } from './kiosks.service.js';
import { KioskWorkerService } from './kiosk-worker.service.js';

/** HR's kiosks: each gets a device token, shown once, and can be revoked. */
@ApiTags('kiosks')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('kiosk')
@Permits('attendance.manage')
@Controller('tenant/kiosks')
export class KiosksController {
  constructor(private readonly kiosks: KiosksService) {}

  @Get()
  list(): Promise<KioskView[]> {
    return this.kiosks.list();
  }

  /** Returns the kiosk's token once; it cannot be shown again. */
  @Post()
  @ApiBody(openApiBody(kioskInputSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(kioskInputSchema)) body: KioskInput,
  ): Promise<KioskCreated> {
    return this.kiosks.create(user, body);
  }

  @Post(':id/revoke')
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KioskView> {
    return this.kiosks.revoke(user, id);
  }
}

/**
 * What a kiosk calls, with its device token as the bearer token. A worker's routes also need
 * the session token from signing in, in the `x-kiosk-session` header.
 */
@ApiTags('kiosk')
@Public()
@UseGuards(KioskGuard)
@Controller('kiosk/v1')
export class KioskDeviceController {
  constructor(
    private readonly kiosks: KiosksService,
    private readonly auth: KioskAuthService,
    private readonly worker: KioskWorkerService,
  ) {}

  @Get('device')
  async device(
    @CurrentKiosk() kiosk: KioskIdentity,
    @CurrentTenant() tenant: TenantWithAccess,
  ): Promise<KioskDeviceView> {
    const view = await this.kiosks.device(kiosk);
    return {
      kiosk: { id: view.id, name: view.name, location: view.location },
      workspace: { name: tenant.name, slug: tenant.slug },
      readOnly: tenant.access.accessState === 'read_only',
    };
  }

  @Post('pin/request')
  @HttpCode(202)
  @ApiBody(openApiBody(kioskPinRequestSchema))
  requestPin(
    @CurrentKiosk() kiosk: KioskIdentity,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(kioskPinRequestSchema)) body: KioskPinRequestInput,
  ): Promise<KioskPinRequestResult> {
    return this.auth.requestPin(kiosk, tenant, body);
  }

  @Post('pin')
  @HttpCode(204)
  @ApiBody(openApiBody(kioskPinSetSchema))
  setPin(
    @CurrentKiosk() kiosk: KioskIdentity,
    @Body(zod(kioskPinSetSchema)) body: KioskPinSetInput,
  ): Promise<void> {
    return this.auth.setPin(kiosk, body);
  }

  @Post('sessions')
  @ReadsOnly()
  @ApiBody(openApiBody(kioskSignInSchema))
  signIn(
    @CurrentKiosk() kiosk: KioskIdentity,
    @Body(zod(kioskSignInSchema)) body: KioskSignInInput,
  ): Promise<KioskSession> {
    return this.auth.signIn(kiosk, body);
  }

  @Post('sessions/end')
  @ReadsOnly()
  @HttpCode(204)
  @UseGuards(KioskSessionGuard)
  end(@CurrentWorker() worker: KioskWorker): Promise<void> {
    return this.auth.end(worker);
  }

  @Get('me')
  @UseGuards(KioskSessionGuard)
  me(
    @CurrentWorker() worker: KioskWorker,
    @CurrentTenant() tenant: TenantWithAccess,
  ): Promise<KioskMeView> {
    return this.worker.me(worker, tenant);
  }

  @Post('leave')
  @UseGuards(KioskSessionGuard)
  @ApiBody(openApiBody(leaveRequestInputSchema))
  applyLeave(
    @CurrentWorker() worker: KioskWorker,
    @CurrentKiosk() kiosk: KioskIdentity,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(leaveRequestInputSchema)) body: LeaveRequestInput,
  ): Promise<LeaveRequestView> {
    return this.worker.applyLeave(worker, kiosk, tenant, body);
  }

  @Get('payslips/:itemId/pdf')
  @UseGuards(KioskSessionGuard)
  async payslip(
    @CurrentWorker() worker: KioskWorker,
    @CurrentKiosk() kiosk: KioskIdentity,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query(zod(kioskPayslipQuerySchema)) query: z.infer<typeof kioskPayslipQuerySchema>,
  ): Promise<StreamableFile> {
    const { bytes, fileName } = await this.worker.payslip(
      worker,
      kiosk,
      tenant,
      itemId,
      query.language,
    );
    return fileResponse(bytes, { contentType: 'application/pdf', fileName, download: false });
  }
}
