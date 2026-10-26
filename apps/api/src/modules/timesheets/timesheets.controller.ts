import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  payslipLanguageSchema,
  timesheetEntriesSchema,
  timesheetMonthQuerySchema,
  timesheetReopenSchema,
  timesheetSubmitSchema,
  type TimesheetEntriesInput,
  type TimesheetEntriesResult,
  type TimesheetListView,
  type TimesheetMonthQuery,
  type TimesheetPrefillResult,
  type TimesheetReopenInput,
  type TimesheetSubmitInput,
  type TimesheetView,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { TimesheetsService } from './timesheets.service.js';

/**
 * Monthly project timesheets: each person's own month (any login with an employee record),
 * and everyone's for those who manage projects.
 */
@ApiTags('timesheets')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('projects')
@Controller('tenant/timesheets')
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  /** My month: days, the projects I may charge, entries and totals. */
  @Get('me')
  mine(
    @CurrentUser() user: AuthUser,
    @Query(zod(timesheetMonthQuerySchema)) query: TimesheetMonthQuery,
  ): Promise<TimesheetView> {
    return this.timesheets.mine(user, query.month);
  }

  /** Saves what it can and reports every other entry with its reason. */
  @Put('me/entries')
  @ApiBody(openApiBody(timesheetEntriesSchema))
  saveEntries(
    @CurrentUser() user: AuthUser,
    @Body(zod(timesheetEntriesSchema)) body: TimesheetEntriesInput,
  ): Promise<TimesheetEntriesResult> {
    return this.timesheets.saveEntries(user, body);
  }

  /** Fills days with attendance and no entries, by the planned split. */
  @Post('me/prefill')
  @HttpCode(200)
  @ApiBody(openApiBody(timesheetMonthQuerySchema))
  prefill(
    @CurrentUser() user: AuthUser,
    @Body(zod(timesheetMonthQuerySchema)) body: TimesheetMonthQuery,
  ): Promise<TimesheetPrefillResult> {
    return this.timesheets.prefill(user, body.month);
  }

  @Post('me/submit')
  @HttpCode(200)
  @ApiBody(openApiBody(timesheetSubmitSchema))
  submit(
    @CurrentUser() user: AuthUser,
    @Body(zod(timesheetSubmitSchema)) body: TimesheetSubmitInput,
  ): Promise<TimesheetView> {
    return this.timesheets.submit(user, body);
  }

  @Get()
  @Permits('projects.manage')
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(timesheetMonthQuerySchema)) query: TimesheetMonthQuery,
  ): Promise<TimesheetListView> {
    return this.timesheets.list(user, query.month);
  }

  /** For its owner, whoever approves it, and those who manage projects. */
  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TimesheetView> {
    return this.timesheets.get(user, id);
  }

  /** The month in the format donors ask for, in English or Bangla. */
  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(payslipLanguageSchema)) query: z.infer<typeof payslipLanguageSchema>,
  ): Promise<StreamableFile> {
    const file = await this.timesheets.file(user, id, query.language);
    return fileResponse(file.bytes, {
      contentType: 'application/pdf',
      fileName: file.fileName,
      download: false,
    });
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @Permits('projects.manage')
  @ApiBody(openApiBody(timesheetReopenSchema))
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(timesheetReopenSchema)) body: TimesheetReopenInput,
  ): Promise<TimesheetView> {
    return this.timesheets.reopen(user, id, body.reason);
  }
}
