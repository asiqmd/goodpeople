import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  grievanceListQuerySchema,
  grievanceStaffReplySchema,
  grievanceStatusSchema,
  type GrievanceDetail,
  type GrievanceList,
  type GrievanceListQuery,
  type GrievanceStaffReplyInput,
  type GrievanceStatusInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import { GrievanceAccessGuard } from './grievance-access.guard.js';
import { GrievancesService } from './grievances.service.js';

/** Workers' grievances for those who handle them; harassment for the complaint committee. */
@ApiTags('grievances')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, GrievanceAccessGuard)
@Controller('tenant/grievances')
export class GrievancesController {
  constructor(private readonly grievances: GrievancesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(grievanceListQuerySchema)) query: GrievanceListQuery,
  ): Promise<GrievanceList> {
    return this.grievances.list(user, query);
  }

  /** Whether this login handles grievances at all, for the web's navigation. */
  @Get('access')
  access(): { ok: true } {
    return { ok: true };
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GrievanceDetail> {
    return this.grievances.detail(user, id);
  }

  // Answering a worker's grievance is the employer's duty (s.33), whatever its billing, as
  // raising one is the worker's right: both stay open in a read-only workspace.
  @Post(':id/replies')
  @WritableWhenReadOnly()
  @ApiBody(openApiBody(grievanceStaffReplySchema))
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(grievanceStaffReplySchema)) body: GrievanceStaffReplyInput,
  ): Promise<GrievanceDetail> {
    return this.grievances.reply(user, id, body);
  }

  @Patch(':id')
  @WritableWhenReadOnly()
  @ApiBody(openApiBody(grievanceStatusSchema))
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(grievanceStatusSchema)) body: GrievanceStatusInput,
  ): Promise<GrievanceDetail> {
    return this.grievances.setStatus(user, id, body);
  }
}
