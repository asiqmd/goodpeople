import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  interviewCancelSchema,
  interviewSchema,
  scorecardSchema,
  type InterviewCancelInput,
  type InterviewInput,
  type InterviewView,
  type MyInterviewDetail,
  type MyInterviews,
  type ScorecardInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { InterviewsService } from './interviews.service.js';

/**
 * Interviews: each interviewer's own (any login with an employee record on a panel) with
 * their scorecards; changing one is for those who manage recruitment or hire for the opening.
 */
@ApiTags('recruitment')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('recruitment')
@Controller('tenant/interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  /** My interviews, to come and past. */
  @Get()
  mine(@CurrentUser() user: AuthUser): Promise<MyInterviews> {
    return this.interviews.mine(user);
  }

  /** One of my interviews: the candidate, the cover note, my scorecard and, once it is in, the others'. */
  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MyInterviewDetail> {
    return this.interviews.myInterview(user, id);
  }

  @Put(':id/scorecard')
  @ApiBody(openApiBody(scorecardSchema))
  scorecard(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(scorecardSchema)) body: ScorecardInput,
  ): Promise<MyInterviewDetail> {
    return this.interviews.submitScorecard(user, id, body);
  }

  /** A new time, place or panel; everyone gets the updated invitation. */
  @Patch(':id')
  @ApiBody(openApiBody(interviewSchema))
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(interviewSchema)) body: InterviewInput,
  ): Promise<InterviewView> {
    return this.interviews.reschedule(user, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiBody(openApiBody(interviewCancelSchema))
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(interviewCancelSchema)) body: InterviewCancelInput,
  ): Promise<InterviewView> {
    return this.interviews.cancel(user, id, body.reason);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InterviewView> {
    return this.interviews.complete(user, id);
  }
}
