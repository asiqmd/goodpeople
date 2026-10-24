import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { BD_RULES, allRules } from '@gp/country-packs';
import {
  holidayCalendarInputSchema,
  holidayCalendarUpdateSchema,
  holidayInputSchema,
  holidayUpdateSchema,
  holidayYearQuerySchema,
  importHolidaysSchema,
  leaveAdjustmentSchema,
  leaveCalendarQuerySchema,
  leaveListQuerySchema,
  leavePreviewSchema,
  leaveRequestInputSchema,
  leaveTypeInputSchema,
  leaveTypeUpdateSchema,
  leaveYearQuerySchema,
  todayIn,
  type HolidayCalendarInput,
  type HolidayCalendarUpdate,
  type HolidayCalendarView,
  type HolidayChangeResult,
  type HolidayInput,
  type HolidayUpdate,
  type HolidayYearView,
  type LeaveAdjustmentInput,
  type LeaveBalanceView,
  type LeaveCalendarView,
  type LeavePreview,
  type LeavePreviewInput,
  type LeaveRequestInput,
  type LeaveRequestView,
  type LeaveTypeInput,
  type LeaveTypeUpdate,
  type LeaveTypeView,
  type RuleView,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { HrOnly, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { EmployeeLeaveService, type EmployeeLeaveSummary } from './employee-leave.service.js';
import { HolidaysService } from './holidays.service.js';
import { isHr } from '../employees/employee.queries.js';
import { LeaveRequestsService } from './leave-requests.service.js';
import { LeaveTypesService } from './leave-types.service.js';

const thisYear = () => Number(todayIn().slice(0, 4));

/** Leave for everyone: types, my balances and requests, the team calendar and approvals. */
@ApiTags('leave')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('leave')
@Controller('tenant')
export class LeaveController {
  constructor(
    private readonly types: LeaveTypesService,
    private readonly requests: LeaveRequestsService,
    private readonly employeeLeave: EmployeeLeaveService,
  ) {}

  /** The country pack's statutory rules, with every version and its legal reference. */
  @Get('rules')
  rules(): RuleView[] {
    return allRules(BD_RULES) as RuleView[];
  }

  @Get('leave/types')
  leaveTypes(@CurrentUser() user: AuthUser): Promise<LeaveTypeView[]> {
    return this.types.list(isHr(user));
  }

  @Post('leave/types')
  @HrOnly()
  @ApiBody(openApiBody(leaveTypeInputSchema))
  createType(
    @CurrentUser() user: AuthUser,
    @Body(zod(leaveTypeInputSchema)) body: LeaveTypeInput,
  ): Promise<LeaveTypeView> {
    return this.types.create(user, body);
  }

  @Patch('leave/types/:id')
  @HrOnly()
  @ApiBody(openApiBody(leaveTypeUpdateSchema))
  updateType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(leaveTypeUpdateSchema)) body: LeaveTypeUpdate,
  ): Promise<LeaveTypeView> {
    return this.types.update(user, id, body);
  }

  @Post('leave/types/defaults')
  @HrOnly()
  provisionDefaults(@CurrentUser() user: AuthUser): Promise<LeaveTypeView[]> {
    return this.types.provisionDefaults(user);
  }

  @Get('me/leave/balances')
  myBalances(
    @CurrentUser() user: AuthUser,
    @Query(zod(leaveYearQuerySchema)) query: z.infer<typeof leaveYearQuerySchema>,
  ): Promise<LeaveBalanceView[]> {
    return this.employeeLeave.myBalances(user, query.year ?? thisYear());
  }

  @Get('me/leave/requests')
  myRequests(
    @CurrentUser() user: AuthUser,
    @Query(zod(leaveYearQuerySchema)) query: z.infer<typeof leaveYearQuerySchema>,
  ): Promise<LeaveRequestView[]> {
    return this.requests.listMine(user, query.year);
  }

  @Post('me/leave/preview')
  @ApiBody(openApiBody(leavePreviewSchema))
  preview(
    @CurrentUser() user: AuthUser,
    @Body(zod(leavePreviewSchema)) body: LeavePreviewInput,
  ): Promise<LeavePreview> {
    return this.requests.preview(user, null, body);
  }

  @Post('me/leave/requests')
  @ApiBody(openApiBody(leaveRequestInputSchema))
  apply(
    @CurrentUser() user: AuthUser,
    @Body(zod(leaveRequestInputSchema)) body: LeaveRequestInput,
  ): Promise<LeaveRequestView> {
    return this.requests.apply(user, null, body);
  }

  /** The employee cancels their own request, or HR cancels anyone's. */
  @Post('leave/requests/:id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeaveRequestView> {
    return this.requests.cancel(user, id);
  }

  @Get('leave/requests')
  @HrOnly()
  allRequests(
    @Query(zod(leaveListQuerySchema)) query: z.infer<typeof leaveListQuerySchema>,
  ): Promise<LeaveRequestView[]> {
    return this.requests.listAll(query);
  }

  @Get('leave/calendar')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query(zod(leaveCalendarQuerySchema)) query: z.infer<typeof leaveCalendarQuerySchema>,
  ): Promise<LeaveCalendarView> {
    return this.requests.calendar(user, query);
  }

  // ── HR, for one employee ───────────────────────────────────────────────────

  @Get('employees/:id/leave')
  @HrOnly()
  employeeSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(leaveYearQuerySchema)) query: z.infer<typeof leaveYearQuerySchema>,
  ): Promise<EmployeeLeaveSummary> {
    return this.employeeLeave.summary(id, query.year ?? thisYear());
  }

  @Post('employees/:id/leave/preview')
  @HrOnly()
  @ApiBody(openApiBody(leavePreviewSchema))
  previewFor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(leavePreviewSchema)) body: LeavePreviewInput,
  ): Promise<LeavePreview> {
    return this.requests.preview(user, id, body);
  }

  @Post('employees/:id/leave/requests')
  @HrOnly()
  @ApiBody(openApiBody(leaveRequestInputSchema))
  applyFor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(leaveRequestInputSchema)) body: LeaveRequestInput,
  ): Promise<LeaveRequestView> {
    return this.requests.apply(user, id, body);
  }

  @Post('employees/:id/leave/adjustments')
  @HrOnly()
  @ApiBody(openApiBody(leaveAdjustmentSchema))
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(leaveAdjustmentSchema)) body: LeaveAdjustmentInput,
  ): Promise<EmployeeLeaveSummary> {
    return this.employeeLeave.adjust(user, id, body);
  }
}

/** Holiday calendars: everyone reads, HR changes. */
@ApiTags('holidays')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('leave')
@Controller('tenant')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get('holiday-calendars')
  calendars(): Promise<HolidayCalendarView[]> {
    return this.holidays.listCalendars();
  }

  @Post('holiday-calendars')
  @HrOnly()
  @ApiBody(openApiBody(holidayCalendarInputSchema))
  createCalendar(
    @CurrentUser() user: AuthUser,
    @Body(zod(holidayCalendarInputSchema)) body: HolidayCalendarInput,
  ): Promise<HolidayCalendarView> {
    return this.holidays.createCalendar(user, body);
  }

  @Patch('holiday-calendars/:id')
  @HrOnly()
  @ApiBody(openApiBody(holidayCalendarUpdateSchema))
  updateCalendar(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(holidayCalendarUpdateSchema)) body: HolidayCalendarUpdate,
  ): Promise<HolidayCalendarView> {
    return this.holidays.renameCalendar(user, id, body);
  }

  @Get('holiday-calendars/:id/holidays')
  year(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(holidayYearQuerySchema)) query: z.infer<typeof holidayYearQuerySchema>,
  ): Promise<HolidayYearView> {
    return this.holidays.year(id, query.year);
  }

  @Get('me/holidays')
  myHolidays(
    @CurrentUser() user: AuthUser,
    @Query(zod(holidayYearQuerySchema)) query: z.infer<typeof holidayYearQuerySchema>,
  ): Promise<HolidayYearView> {
    return this.holidays.myYear(user, query.year);
  }

  @Post('holiday-calendars/:id/holidays')
  @HrOnly()
  @ApiBody(openApiBody(holidayInputSchema))
  add(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(holidayInputSchema)) body: HolidayInput,
  ): Promise<HolidayChangeResult> {
    return this.holidays.add(user, id, body);
  }

  @Post('holiday-calendars/:id/import-bd')
  @HrOnly()
  @ApiBody(openApiBody(importHolidaysSchema))
  importBd(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(importHolidaysSchema)) body: z.infer<typeof importHolidaysSchema>,
  ) {
    return this.holidays.importBd(user, id, body.year);
  }

  @Patch('holidays/:id')
  @HrOnly()
  @ApiBody(openApiBody(holidayUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(holidayUpdateSchema)) body: HolidayUpdate,
  ): Promise<HolidayChangeResult> {
    return this.holidays.update(user, id, body);
  }

  @Delete('holidays/:id')
  @HrOnly()
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<HolidayChangeResult> {
    return this.holidays.remove(user, id);
  }
}
