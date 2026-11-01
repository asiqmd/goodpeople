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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  goalAgreeAllSchema,
  goalCheckinSchema,
  goalChoicesQuerySchema,
  goalCompleteSchema,
  goalDropSchema,
  goalListQuerySchema,
  goalPeopleQuerySchema,
  goalSchema,
  goalSubmitSchema,
  goalUpdateSchema,
  teamGoalsQuerySchema,
  type EmployeeRef,
  type GoalAgreeAllInput,
  type GoalCheckinInput,
  type GoalChoices,
  type GoalChoicesQuery,
  type GoalCompleteInput,
  type GoalDetail,
  type GoalDropInput,
  type GoalInput,
  type GoalListQuery,
  type GoalPeopleQuery,
  type GoalSubmitInput,
  type GoalSubmitResult,
  type GoalUpdateInput,
  type GoalView,
  type MyGoals,
  type Page,
  type TeamGoals,
  type TeamGoalsQuery,
  type UnitGoals,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { GoalsService } from './goals.service.js';

/**
 * Goals and KPIs. Everyone has their own goals; a manager sees, drafts and agrees those of the
 * people below them; `performance.manage` everyone's in its companies. Who may see a goal is
 * checked per goal: anyone else finds nothing.
 */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('performance')
@Controller('tenant/performance/goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  /** Everyone's goals in the login's companies. */
  @Get()
  @Permits('performance.manage')
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(goalListQuerySchema)) query: GoalListQuery,
  ): Promise<Page<GoalView>> {
    return this.goals.list(user, query);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser): Promise<MyGoals> {
    return this.goals.mine(user);
  }

  @Get('team')
  team(
    @CurrentUser() user: AuthUser,
    @Query(zod(teamGoalsQuerySchema)) query: TeamGoalsQuery,
  ): Promise<TeamGoals> {
    return this.goals.team(user, query);
  }

  @Get('units')
  units(@CurrentUser() user: AuthUser): Promise<UnitGoals> {
    return this.goals.units(user);
  }

  /** People the login may draft goals for. */
  @Get('people')
  people(
    @CurrentUser() user: AuthUser,
    @Query(zod(goalPeopleQuerySchema)) query: GoalPeopleQuery,
  ): Promise<EmployeeRef[]> {
    return this.goals.people(user, query);
  }

  /** What the form for a new goal of this person or unit offers. */
  @Get('choices')
  choices(
    @CurrentUser() user: AuthUser,
    @Query(zod(goalChoicesQuerySchema)) query: GoalChoicesQuery,
  ): Promise<GoalChoices> {
    return this.goals.choices(user, query);
  }

  @Post()
  @ApiBody(openApiBody(goalSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(goalSchema)) body: GoalInput,
  ): Promise<GoalDetail> {
    return this.goals.create(user, body);
  }

  /** The login's own drafts for a cycle, sent to their manager to agree. */
  @Post('submit')
  @HttpCode(200)
  @ApiBody(openApiBody(goalSubmitSchema))
  submit(
    @CurrentUser() user: AuthUser,
    @Body(zod(goalSubmitSchema)) body: GoalSubmitInput,
  ): Promise<GoalSubmitResult> {
    return this.goals.submit(user, body);
  }

  /** Every draft of one person for a cycle, agreed at once. */
  @Post('agree')
  @HttpCode(200)
  @ApiBody(openApiBody(goalAgreeAllSchema))
  agreeAll(
    @CurrentUser() user: AuthUser,
    @Body(zod(goalAgreeAllSchema)) body: GoalAgreeAllInput,
  ): Promise<GoalView[]> {
    return this.goals.agreeAll(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<GoalDetail> {
    return this.goals.get(user, id);
  }

  @Patch(':id')
  @ApiBody(openApiBody(goalUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(goalUpdateSchema)) body: GoalUpdateInput,
  ): Promise<GoalDetail> {
    return this.goals.update(user, id, body);
  }

  @Post(':id/agree')
  @HttpCode(200)
  agree(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GoalDetail> {
    return this.goals.agree(user, id);
  }

  @Post(':id/checkins')
  @ApiBody(openApiBody(goalCheckinSchema))
  checkin(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(goalCheckinSchema)) body: GoalCheckinInput,
  ): Promise<GoalDetail> {
    return this.goals.checkin(user, id, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiBody(openApiBody(goalCompleteSchema))
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(goalCompleteSchema)) body: GoalCompleteInput,
  ): Promise<GoalDetail> {
    return this.goals.complete(user, id, body);
  }

  @Post(':id/drop')
  @HttpCode(200)
  @ApiBody(openApiBody(goalDropSchema))
  drop(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(goalDropSchema)) body: GoalDropInput,
  ): Promise<GoalDetail> {
    return this.goals.drop(user, id, body);
  }
}
