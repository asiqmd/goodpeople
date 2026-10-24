import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  MAX_SELFIE_BYTES,
  attendanceDailyQuerySchema,
  attendanceMonthQuerySchema,
  attendanceProcessSchema,
  attendanceProfileSchema,
  attendanceRangeQuerySchema,
  attendanceSettingsSchema,
  deviceUpdateSchema,
  edgeAgentInputSchema,
  edgeHeartbeatSchema,
  edgePunchesSchema,
  manualPunchSchema,
  regularizationInputSchema,
  regularizationListQuerySchema,
  rosterClearSchema,
  rosterInputSchema,
  rosterQuerySchema,
  selfPunchSchema,
  shiftAssignmentSchema,
  shiftInputSchema,
  shiftUpdateSchema,
  voidPunchSchema,
  type AttendanceProcessInput,
  type AttendanceProfileInput,
  type AttendanceRangeView,
  type AttendanceSettingsInput,
  type AttendanceSettingsView,
  type DeviceUpdateInput,
  type DeviceView,
  type EdgeAgentCreated,
  type EdgeAgentInput,
  type EdgeAgentView,
  type EdgeHeartbeatInput,
  type EdgeHeartbeatResult,
  type EdgePunchesInput,
  type EdgePunchesResult,
  type EmployeeAttendanceView,
  type ManualPunchInput,
  type MonthSummaryView,
  type MyAttendanceToday,
  type PunchView,
  type RegularizationInput,
  type RegularizationView,
  type RosterClearInput,
  type RosterInput,
  type RosterView,
  type SelfPunchInput,
  type ShiftAssignmentInput,
  type ShiftInput,
  type ShiftUpdate,
  type ShiftView,
  type TeamDayView,
  type UnmatchedPunchGroup,
  type VoidPunchInput,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser, type AuthedRequest } from '../../common/auth-user.js';
import { HrOnly, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { isHr } from '../employees/employee.queries.js';
import { AttendanceService } from './attendance.service.js';
import { DevicesService } from './devices.service.js';
import { EdgeAgentGuard } from './edge-agent.guard.js';
import { PunchesService } from './punches.service.js';
import { RegularizationsService } from './regularizations.service.js';
import { ShiftsService } from './shifts.service.js';

type Range = z.infer<typeof attendanceRangeQuerySchema>;

/** Attendance for everyone (my day, punching, corrections) and HR (shifts, devices, reports). */
@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('attendance')
@Controller('tenant')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly punches: PunchesService,
    private readonly shifts: ShiftsService,
    private readonly devices: DevicesService,
    private readonly regularizations: RegularizationsService,
  ) {}

  // ── Me ─────────────────────────────────────────────────────────────────────

  @Get('me/attendance/today')
  today(@CurrentUser() user: AuthUser): Promise<MyAttendanceToday> {
    return this.attendance.today(user);
  }

  /** JSON, or a multipart form with a `selfie` photo when the workspace asks for one. */
  @Post('me/attendance/punch')
  @ApiBody(openApiBody(selfPunchSchema))
  @UseInterceptors(FileInterceptor('selfie', { limits: { fileSize: MAX_SELFIE_BYTES, files: 1 } }))
  punch(
    @CurrentUser() user: AuthUser,
    @Body(zod(selfPunchSchema)) body: SelfPunchInput,
    @UploadedFile() selfie: Express.Multer.File | undefined,
  ): Promise<MyAttendanceToday> {
    return this.punches.selfPunch(user, body, selfie);
  }

  @Get('me/attendance')
  myRange(
    @CurrentUser() user: AuthUser,
    @Query(zod(attendanceRangeQuerySchema)) query: Range,
  ): Promise<AttendanceRangeView> {
    return this.attendance.myRange(user, query.from, query.to);
  }

  @Get('me/attendance/regularizations')
  myRegularizations(@CurrentUser() user: AuthUser): Promise<RegularizationView[]> {
    return this.regularizations.listMine(user);
  }

  @Post('me/attendance/regularizations')
  @ApiBody(openApiBody(regularizationInputSchema))
  requestRegularization(
    @CurrentUser() user: AuthUser,
    @Body(zod(regularizationInputSchema)) body: RegularizationInput,
  ): Promise<RegularizationView> {
    return this.regularizations.apply(user, body);
  }

  /** The employee cancels their own pending correction, or HR cancels anyone's. */
  @Post('attendance/regularizations/:id/cancel')
  cancelRegularization(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RegularizationView> {
    return this.regularizations.cancel(user, id);
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  @Get('attendance/daily')
  daily(
    @CurrentUser() user: AuthUser,
    @Query(zod(attendanceDailyQuerySchema)) query: z.infer<typeof attendanceDailyQuerySchema>,
  ): Promise<TeamDayView> {
    return this.attendance.daily(user, query);
  }

  @Get('attendance/shifts')
  listShifts(@CurrentUser() user: AuthUser): Promise<ShiftView[]> {
    return this.shifts.list(isHr(user));
  }

  // ── HR ─────────────────────────────────────────────────────────────────────

  @Get('attendance/summary')
  @HrOnly()
  summary(
    @Query(zod(attendanceMonthQuerySchema)) query: z.infer<typeof attendanceMonthQuerySchema>,
  ): Promise<MonthSummaryView> {
    return this.attendance.monthSummary(query);
  }

  @Get('attendance/regularizations')
  @HrOnly()
  allRegularizations(
    @Query(zod(regularizationListQuerySchema))
    query: z.infer<typeof regularizationListQuerySchema>,
  ): Promise<RegularizationView[]> {
    return this.regularizations.listAll(query);
  }

  @Post('attendance/process')
  @HrOnly()
  @ApiBody(openApiBody(attendanceProcessSchema))
  process(
    @CurrentUser() user: AuthUser,
    @Body(zod(attendanceProcessSchema)) body: AttendanceProcessInput,
  ): Promise<{ days: number }> {
    return this.attendance.reprocess(user, body);
  }

  @Get('attendance/settings')
  @HrOnly()
  settings(): Promise<AttendanceSettingsView> {
    return this.attendance.settings();
  }

  @Patch('attendance/settings')
  @HrOnly()
  @ApiBody(openApiBody(attendanceSettingsSchema))
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body(zod(attendanceSettingsSchema)) body: AttendanceSettingsInput,
  ): Promise<AttendanceSettingsView> {
    return this.attendance.updateSettings(user, body);
  }

  @Post('attendance/shifts')
  @HrOnly()
  @ApiBody(openApiBody(shiftInputSchema))
  createShift(
    @CurrentUser() user: AuthUser,
    @Body(zod(shiftInputSchema)) body: ShiftInput,
  ): Promise<ShiftView> {
    return this.shifts.create(user, body);
  }

  @Patch('attendance/shifts/:id')
  @HrOnly()
  @ApiBody(openApiBody(shiftUpdateSchema))
  updateShift(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(shiftUpdateSchema)) body: ShiftUpdate,
  ): Promise<ShiftView> {
    return this.shifts.update(user, id, body);
  }

  @Post('attendance/shift-assignments')
  @HrOnly()
  @ApiBody(openApiBody(shiftAssignmentSchema))
  assignShift(
    @CurrentUser() user: AuthUser,
    @Body(zod(shiftAssignmentSchema)) body: ShiftAssignmentInput,
  ): Promise<{ assigned: number }> {
    return this.shifts.assign(user, body);
  }

  @Get('attendance/roster')
  @HrOnly()
  roster(
    @Query(zod(rosterQuerySchema)) query: z.infer<typeof rosterQuerySchema>,
  ): Promise<RosterView> {
    return this.shifts.roster(query);
  }

  @Post('attendance/roster')
  @HrOnly()
  @ApiBody(openApiBody(rosterInputSchema))
  setRoster(
    @CurrentUser() user: AuthUser,
    @Body(zod(rosterInputSchema)) body: RosterInput,
  ): Promise<{ entries: number }> {
    return this.shifts.setRoster(user, body);
  }

  @Post('attendance/roster/clear')
  @HrOnly()
  @ApiBody(openApiBody(rosterClearSchema))
  clearRoster(
    @CurrentUser() user: AuthUser,
    @Body(zod(rosterClearSchema)) body: RosterClearInput,
  ): Promise<{ entries: number }> {
    return this.shifts.clearRoster(user, body);
  }

  @Get('attendance/agents')
  @HrOnly()
  agents(): Promise<EdgeAgentView[]> {
    return this.devices.agents();
  }

  /** Returns the agent's token once; it cannot be shown again. */
  @Post('attendance/agents')
  @HrOnly()
  @ApiBody(openApiBody(edgeAgentInputSchema))
  createAgent(
    @CurrentUser() user: AuthUser,
    @Body(zod(edgeAgentInputSchema)) body: EdgeAgentInput,
  ): Promise<EdgeAgentCreated> {
    return this.devices.createAgent(user, body);
  }

  @Post('attendance/agents/:id/revoke')
  @HrOnly()
  revokeAgent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EdgeAgentView> {
    return this.devices.revokeAgent(user, id);
  }

  @Get('attendance/devices')
  @HrOnly()
  listDevices(): Promise<DeviceView[]> {
    return this.devices.devices();
  }

  @Patch('attendance/devices/:id')
  @HrOnly()
  @ApiBody(openApiBody(deviceUpdateSchema))
  updateDevice(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(deviceUpdateSchema)) body: DeviceUpdateInput,
  ): Promise<DeviceView> {
    return this.devices.updateDevice(user, id, body);
  }

  @Get('attendance/unmatched')
  @HrOnly()
  unmatched(): Promise<UnmatchedPunchGroup[]> {
    return this.devices.unmatched();
  }

  @Post('attendance/punches/:id/void')
  @HrOnly()
  @ApiBody(openApiBody(voidPunchSchema))
  voidPunch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(voidPunchSchema)) body: VoidPunchInput,
  ): Promise<PunchView> {
    return this.punches.voidPunch(user, id, body);
  }

  // ── HR, for one employee ───────────────────────────────────────────────────

  @Get('employees/:id/attendance')
  @HrOnly()
  employee(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(attendanceRangeQuerySchema)) query: Range,
  ): Promise<EmployeeAttendanceView> {
    return this.attendance.employee(id, query.from, query.to);
  }

  @Patch('employees/:id/attendance-profile')
  @HrOnly()
  @ApiBody(openApiBody(attendanceProfileSchema))
  setProfile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(attendanceProfileSchema)) body: AttendanceProfileInput,
  ) {
    return this.punches.setProfile(user, id, body);
  }

  @Post('employees/:id/attendance/punches')
  @HrOnly()
  @ApiBody(openApiBody(manualPunchSchema))
  manualPunch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(manualPunchSchema)) body: ManualPunchInput,
  ): Promise<PunchView> {
    return this.punches.manualPunch(user, id, body);
  }
}

/** What a site's Edge Agent calls, with its own token instead of a user's. */
@ApiTags('edge')
@Public()
@UseGuards(EdgeAgentGuard)
@Controller('edge/v1')
export class EdgeController {
  constructor(private readonly devices: DevicesService) {}

  @Post('punches')
  @HttpCode(200)
  @ApiBody(openApiBody(edgePunchesSchema))
  punches(
    @Req() req: AuthedRequest,
    @Body(zod(edgePunchesSchema)) body: EdgePunchesInput,
  ): Promise<EdgePunchesResult> {
    return this.devices.ingest(req.edgeAgent!, body);
  }

  @Post('heartbeat')
  @HttpCode(200)
  @ApiBody(openApiBody(edgeHeartbeatSchema))
  heartbeat(
    @Req() req: AuthedRequest,
    @Body(zod(edgeHeartbeatSchema)) body: EdgeHeartbeatInput,
  ): Promise<EdgeHeartbeatResult> {
    return this.devices.heartbeat(req.edgeAgent!, body);
  }
}
