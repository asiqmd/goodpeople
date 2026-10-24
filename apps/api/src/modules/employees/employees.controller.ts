import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  employeeListQuerySchema,
  hireEmployeeSchema,
  jobChangeSchema,
  nomineesSchema,
  paymentAccountsSchema,
  updateEmployeeSchema,
  type EmployeeDetail,
  type EmployeeListItem,
  type EmployeeListQuery,
  type HireEmployeeInput,
  type HireResult,
  type JobAssignmentView,
  type JobChangeInput,
  type NomineesInput,
  type NomineeView,
  type Page,
  type PaymentAccountsInput,
  type PaymentAccountView,
  type TenantWithAccess,
  type UpdateEmployeeInput,
} from '@gp/shared';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { HrOnly, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@HrOnly()
@Controller('tenant/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(
    @Query(zod(employeeListQuerySchema)) query: EmployeeListQuery,
  ): Promise<Page<EmployeeListItem>> {
    return this.employees.list(query);
  }

  @Post()
  @ApiBody(openApiBody(hireEmployeeSchema))
  hire(
    @CurrentUser() actor: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(hireEmployeeSchema)) body: HireEmployeeInput,
  ): Promise<HireResult> {
    return this.employees.hire(actor, tenant, body);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmployeeDetail> {
    return this.employees.get(id);
  }

  @Patch(':id')
  @ApiBody(openApiBody(updateEmployeeSchema))
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updateEmployeeSchema)) body: UpdateEmployeeInput,
  ): Promise<EmployeeDetail> {
    return this.employees.update(actor, id, body);
  }

  @Get(':id/job-history')
  history(@Param('id', ParseUUIDPipe) id: string): Promise<JobAssignmentView[]> {
    return this.employees.history(id);
  }

  /** Confirmation, transfer, promotion, increment, redesignation or another change, from a date. */
  @Post(':id/job-changes')
  @ApiBody(openApiBody(jobChangeSchema))
  changeJob(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(jobChangeSchema)) body: JobChangeInput,
  ): Promise<EmployeeDetail> {
    return this.employees.changeJob(actor, id, body);
  }

  @Put(':id/nominees')
  @ApiBody(openApiBody(nomineesSchema))
  nominees(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(nomineesSchema)) body: NomineesInput,
  ): Promise<NomineeView[]> {
    return this.employees.replaceNominees(actor, id, body);
  }

  @Put(':id/payment-accounts')
  @ApiBody(openApiBody(paymentAccountsSchema))
  paymentAccounts(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(paymentAccountsSchema)) body: PaymentAccountsInput,
  ): Promise<PaymentAccountView[]> {
    return this.employees.replacePaymentAccounts(actor, id, body);
  }
}

/** Self-service: any workspace user with a linked employee record. */
@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard)
@RequireFeature('core_hr')
@Controller('tenant/me')
export class MeController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('employee')
  employee(@CurrentUser() user: AuthUser): Promise<EmployeeDetail> {
    return this.employees.mine(user);
  }
}
