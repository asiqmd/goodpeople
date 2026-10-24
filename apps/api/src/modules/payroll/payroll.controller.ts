import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  payChangeSchema,
  payComponentSchema,
  payComponentUpdateSchema,
  payGroupSchema,
  payGroupUpdateSchema,
  payPreviewSchema,
  payrollSettingsSchema,
  salaryStructureSchema,
  salaryStructureUpdateSchema,
  structurePreviewSchema,
  type EmployeePayView,
  type PayChangeInput,
  type PayComponentInput,
  type PayComponentUpdateInput,
  type PayComponentView,
  type PayGroupInput,
  type PayGroupUpdateInput,
  type PayGroupView,
  type PayPreview,
  type PayPreviewInput,
  type PayRecordView,
  type PayrollSettingsInput,
  type PayrollSettingsView,
  type SalaryStructureInput,
  type SalaryStructureUpdateInput,
  type SalaryStructureView,
  type StructurePreview,
  type StructurePreviewInput,
  type WageBoardView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { EmployeePayService } from './employee-pay.service.js';
import { PayrollSetupService } from './payroll-setup.service.js';

/** Setting payroll up: components, structures, pay groups, settings and minimum wages. */
@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant/payroll')
export class PayrollSetupController {
  constructor(private readonly setup: PayrollSetupService) {}

  @Get('components')
  @Permits('payroll.view')
  components(): Promise<PayComponentView[]> {
    return this.setup.components();
  }

  @Post('components')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payComponentSchema))
  createComponent(
    @CurrentUser() user: AuthUser,
    @Body(zod(payComponentSchema)) body: PayComponentInput,
  ): Promise<PayComponentView> {
    return this.setup.createComponent(user, body);
  }

  @Patch('components/:id')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payComponentUpdateSchema))
  updateComponent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(payComponentUpdateSchema)) body: PayComponentUpdateInput,
  ): Promise<PayComponentView> {
    return this.setup.updateComponent(user, id, body);
  }

  @Get('structures')
  @Permits('payroll.view')
  structures(): Promise<SalaryStructureView[]> {
    return this.setup.structures();
  }

  /** Works lines out for an amount without saving them. */
  @Post('structures/preview')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(structurePreviewSchema))
  previewStructure(
    @Body(zod(structurePreviewSchema)) body: StructurePreviewInput,
  ): Promise<StructurePreview> {
    return this.setup.preview(body);
  }

  @Post('structures')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(salaryStructureSchema))
  createStructure(
    @CurrentUser() user: AuthUser,
    @Body(zod(salaryStructureSchema)) body: SalaryStructureInput,
  ): Promise<SalaryStructureView> {
    return this.setup.createStructure(user, body);
  }

  @Patch('structures/:id')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(salaryStructureUpdateSchema))
  updateStructure(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(salaryStructureUpdateSchema)) body: SalaryStructureUpdateInput,
  ): Promise<SalaryStructureView> {
    return this.setup.updateStructure(user, id, body);
  }

  @Get('pay-groups')
  @Permits('payroll.view')
  payGroups(): Promise<PayGroupView[]> {
    return this.setup.payGroups();
  }

  @Post('pay-groups')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payGroupSchema))
  createPayGroup(
    @CurrentUser() user: AuthUser,
    @Body(zod(payGroupSchema)) body: PayGroupInput,
  ): Promise<PayGroupView> {
    return this.setup.createPayGroup(user, body);
  }

  @Patch('pay-groups/:id')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payGroupUpdateSchema))
  updatePayGroup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(payGroupUpdateSchema)) body: PayGroupUpdateInput,
  ): Promise<PayGroupView> {
    return this.setup.updatePayGroup(user, id, body);
  }

  @Get('settings')
  @Permits('payroll.view')
  settings(): Promise<PayrollSettingsView> {
    return this.setup.settings();
  }

  /** Maker-checker guards the people who manage pay, so only those who also approve change it. */
  @Patch('settings')
  @Permits('payroll.manage', 'payroll.approve')
  @ApiBody(openApiBody(payrollSettingsSchema))
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body(zod(payrollSettingsSchema)) body: PayrollSettingsInput,
  ): Promise<PayrollSettingsView> {
    return this.setup.updateSettings(user, body);
  }

  @Get('wage-boards')
  @Permits('payroll.view')
  wageBoards(): WageBoardView[] {
    return this.setup.wageBoards();
  }
}

/** People's pay: history, changes through maker-checker, and one's own pay. */
@ApiTags('payroll')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('payroll')
@Controller('tenant')
export class EmployeePayController {
  constructor(private readonly pay: EmployeePayService) {}

  @Get('employees/:id/pay')
  @Permits('payroll.view')
  employeePay(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeePayView> {
    return this.pay.employeePay(id);
  }

  @Post('employees/:id/pay/preview')
  @HttpCode(200)
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payPreviewSchema))
  preview(@Body(zod(payPreviewSchema)) body: PayPreviewInput): Promise<PayPreview> {
    return this.pay.preview(body);
  }

  /** Proposes a change; with maker-checker on it waits in the Approvals inbox. */
  @Post('employees/:id/pay')
  @Permits('payroll.manage')
  @ApiBody(openApiBody(payChangeSchema))
  propose(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(payChangeSchema)) body: PayChangeInput,
  ): Promise<PayRecordView> {
    return this.pay.propose(user, id, body);
  }

  @Post('pay-changes/:id/cancel')
  @HttpCode(204)
  @Permits('payroll.manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.pay.cancel(user, id);
  }

  @Get('me/pay')
  myPay(@CurrentUser() user: AuthUser): Promise<EmployeePayView> {
    return this.pay.myPay(user);
  }
}
