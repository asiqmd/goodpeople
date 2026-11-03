import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  uaeEmployerInputSchema,
  uaeWorkerInputSchema,
  uaePayrollInputSchema,
  uaeSettlementInputSchema,
  uaeComparisonInputSchema,
  uaeEvidenceInputSchema,
  uaeWpsEventInputSchema,
  uaeLeaveInputSchema,
  type UaeLeaveInput,
  type UaeEmployerInput,
  type UaeWorkerInput,
  type UaePayrollInput,
  type UaeSettlementInput,
  type UaeComparisonInput,
  type UaeEvidenceInput,
  type UaeWpsEventInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { PdfService } from '../letters/pdf.service.js';
import { UaeService } from './uae.service.js';
import { renderUaePreview } from './uae-preview.js';

@Controller('tenant/uae')
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Permits('payroll.view', 'employees.identity')
export class UaeController {
  constructor(
    private readonly service: UaeService,
    private readonly pdf: PdfService,
  ) {}
  @Post('leave-preview') leave(
    @CurrentUser() actor: AuthUser,
    @Body(zod(uaeLeaveInputSchema)) input: UaeLeaveInput,
  ) {
    return this.service.leave(actor, input);
  }
  @Get() overview(
    @CurrentUser() actor: AuthUser,
    @Query(zod(z.object({ legalEntityId: z.uuid().optional() }).strict()))
    q: { legalEntityId?: string },
  ) {
    return this.service.overview(actor, q.legalEntityId);
  }
  @Post('employers') @Permits('payroll.view', 'employees.identity', 'org.manage') employer(
    @CurrentUser() actor: AuthUser,
    @Body(zod(uaeEmployerInputSchema)) input: UaeEmployerInput,
  ) {
    return this.service.addEmployer(actor, input);
  }
  @Post('workers') @Permits('payroll.view', 'payroll.manage', 'employees.identity') worker(
    @CurrentUser() actor: AuthUser,
    @Body(zod(uaeWorkerInputSchema)) input: UaeWorkerInput,
  ) {
    return this.service.addWorker(actor, input);
  }
  @Post('pilots/payroll') @Permits('payroll.view', 'payroll.manage', 'employees.identity') payroll(
    @CurrentUser() actor: AuthUser,
    @Body(zod(uaePayrollInputSchema)) input: UaePayrollInput,
  ) {
    return this.service.createPilot(actor, input, 'payroll');
  }
  @Post('pilots/settlement')
  @Permits('payroll.view', 'payroll.manage', 'employees.identity')
  settlement(
    @CurrentUser() actor: AuthUser,
    @Body(zod(uaeSettlementInputSchema)) input: UaeSettlementInput,
  ) {
    return this.service.createPilot(actor, input, 'settlement');
  }
  @Get('pilots/:id') pilot(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPilot(actor, id);
  }
  @Post('pilots/:id/comparisons')
  @Permits('payroll.view', 'payroll.approve', 'employees.identity')
  compare(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(uaeComparisonInputSchema)) input: UaeComparisonInput,
  ) {
    return this.service.compare(actor, id, input);
  }
  @Post('evidence') @Permits('payroll.view', 'employees.identity', 'org.manage') evidence(
    @CurrentUser() actor: AuthUser,
    @Body(zod(uaeEvidenceInputSchema)) input: UaeEvidenceInput,
  ) {
    return this.service.evidence(actor, input);
  }
  @Post('wps/:id/sandbox') @Permits('payroll.view', 'payroll.manage', 'employees.identity') sandbox(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.createWps(actor, id);
  }
  @Post('wps/:id/events') @Permits('payroll.view', 'payroll.manage', 'employees.identity') event(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(uaeWpsEventInputSchema)) input: UaeWpsEventInput,
  ) {
    return this.service.wpsEvent(actor, id, input);
  }
  @Get('wps/:id/file') async file(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.service.wpsFile(actor, id);
    return new StreamableFile(Buffer.from(file.file), {
      type: 'text/plain; charset=utf-8',
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
  @Get('pilots/:id/preview.pdf') async preview(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(z.object({ language: z.enum(['en', 'bn', 'ar']).default('en') }).strict()))
    query: { language: 'en' | 'bn' | 'ar' },
  ) {
    const pilot = await this.service.getPilot(actor, id);
    return new StreamableFile(await this.pdf.render(renderUaePreview(pilot, query.language)), {
      type: 'application/pdf',
      disposition: 'attachment; filename="uae-unreviewed-preview.pdf"',
    });
  }
  @Post('activate')
  @Permits('payroll.view', 'payroll.manage', 'employees.identity', 'org.manage')
  activate() {
    return this.service.activate();
  }
  @Post('wps/export') @Permits('payroll.view', 'payroll.manage', 'employees.identity') export() {
    return this.service.activate();
  }
}
