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
  saudiEmployerInputSchema,
  saudiWorkerInputSchema,
  saudiPayrollInputSchema,
  saudiSettlementInputSchema,
  saudiComparisonInputSchema,
  saudiEvidenceInputSchema,
  saudiWpsEventInputSchema,
  saudiLeaveInputSchema,
  type SaudiLeaveInput,
  type SaudiEmployerInput,
  type SaudiWorkerInput,
  type SaudiPayrollInput,
  type SaudiSettlementInput,
  type SaudiComparisonInput,
  type SaudiEvidenceInput,
  type SaudiWpsEventInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { PdfService } from '../letters/pdf.service.js';
import { SaudiService } from './saudi.service.js';
import { renderSaudiPreview } from './saudi-preview.js';

@Controller('tenant/saudi')
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Permits('payroll.view', 'employees.identity')
export class SaudiController {
  constructor(
    private readonly service: SaudiService,
    private readonly pdf: PdfService,
  ) {}
  @Post('leave-preview') leave(
    @CurrentUser() actor: AuthUser,
    @Body(zod(saudiLeaveInputSchema)) input: SaudiLeaveInput,
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
    @Body(zod(saudiEmployerInputSchema)) input: SaudiEmployerInput,
  ) {
    return this.service.addEmployer(actor, input);
  }
  @Post('workers') @Permits('payroll.view', 'payroll.manage', 'employees.identity') worker(
    @CurrentUser() actor: AuthUser,
    @Body(zod(saudiWorkerInputSchema)) input: SaudiWorkerInput,
  ) {
    return this.service.addWorker(actor, input);
  }
  @Post('pilots/payroll') @Permits('payroll.view', 'payroll.manage', 'employees.identity') payroll(
    @CurrentUser() actor: AuthUser,
    @Body(zod(saudiPayrollInputSchema)) input: SaudiPayrollInput,
  ) {
    return this.service.createPilot(actor, input, 'payroll');
  }
  @Post('pilots/settlement')
  @Permits('payroll.view', 'payroll.manage', 'employees.identity')
  settlement(
    @CurrentUser() actor: AuthUser,
    @Body(zod(saudiSettlementInputSchema)) input: SaudiSettlementInput,
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
    @Body(zod(saudiComparisonInputSchema)) input: SaudiComparisonInput,
  ) {
    return this.service.compare(actor, id, input);
  }
  @Post('evidence') @Permits('payroll.view', 'employees.identity', 'org.manage') evidence(
    @CurrentUser() actor: AuthUser,
    @Body(zod(saudiEvidenceInputSchema)) input: SaudiEvidenceInput,
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
    @Body(zod(saudiWpsEventInputSchema)) input: SaudiWpsEventInput,
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
    return new StreamableFile(await this.pdf.render(renderSaudiPreview(pilot, query.language)), {
      type: 'application/pdf',
      disposition: 'attachment; filename="saudi-unreviewed-preview.pdf"',
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
