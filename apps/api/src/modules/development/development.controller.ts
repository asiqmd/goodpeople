import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  outcomesQuerySchema,
  planAcknowledgeSchema,
  planCheckinSchema,
  planCloseSchema,
  planCreateSchema,
  planExtendSchema,
  planListQuerySchema,
  planPeopleQuerySchema,
  planUpdateSchema,
  probationListQuerySchema,
  probationReviewSubmitSchema,
  type EmployeeRef,
  type OutcomeCycle,
  type OutcomesQuery,
  type OutcomesView,
  type PerformanceRecord,
  type PlanAcknowledgeInput,
  type PlanCheckinInput,
  type PlanCloseInput,
  type PlanCreateInput,
  type PlanExtendInput,
  type PlanListItem,
  type PlanListQuery,
  type PlanPeopleQuery,
  type PlanUpdateInput,
  type PlanView,
  type ProbationListQuery,
  type ProbationReviewListItem,
  type ProbationReviewSubmitInput,
  type ProbationReviewView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { PlansService } from './plans.service.js';
import { ProbationReviewsService } from './probation-reviews.service.js';
import { PerformanceRecordService } from './record.service.js';

/**
 * Improvement plans: run by the person's manager or HR for their company, read and
 * acknowledged by the person once started. Anyone else finds nothing.
 */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('performance')
@Controller('tenant/performance/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(planListQuerySchema)) query: PlanListQuery,
  ): Promise<PlanListItem[]> {
    return this.plans.list(user, query);
  }

  /** The people the login may draft a plan for. */
  @Get('people')
  people(
    @CurrentUser() user: AuthUser,
    @Query(zod(planPeopleQuerySchema)) query: PlanPeopleQuery,
  ): Promise<EmployeeRef[]> {
    return this.plans.people(user, query.search);
  }

  @Post()
  @ApiBody(openApiBody(planCreateSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(planCreateSchema)) body: PlanCreateInput,
  ): Promise<PlanView> {
    return this.plans.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<PlanView> {
    return this.plans.get(user, id);
  }

  /** A draft's content; a plan under way is extended or closed instead. */
  @Patch(':id')
  @ApiBody(openApiBody(planUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(planUpdateSchema)) body: PlanUpdateInput,
  ): Promise<PlanView> {
    return this.plans.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.plans.remove(user, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<PlanView> {
    return this.plans.start(user, id);
  }

  @Post(':id/checkins')
  @ApiBody(openApiBody(planCheckinSchema))
  checkin(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(planCheckinSchema)) body: PlanCheckinInput,
  ): Promise<PlanView> {
    return this.plans.checkin(user, id, body);
  }

  @Post(':id/extend')
  @HttpCode(200)
  @ApiBody(openApiBody(planExtendSchema))
  extend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(planExtendSchema)) body: PlanExtendInput,
  ): Promise<PlanView> {
    return this.plans.extend(user, id, body);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ApiBody(openApiBody(planCloseSchema))
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(planCloseSchema)) body: PlanCloseInput,
  ): Promise<PlanView> {
    return this.plans.close(user, id, body);
  }

  @Post(':id/acknowledge')
  @HttpCode(200)
  @ApiBody(openApiBody(planAcknowledgeSchema))
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(planAcknowledgeSchema)) body: PlanAcknowledgeInput,
  ): Promise<PlanView> {
    return this.plans.acknowledge(user, id, body);
  }
}

/** Probation reviews: for the manager asked and for HR; never for the person. */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('performance')
@Controller('tenant/performance/probation')
export class ProbationReviewsController {
  constructor(private readonly probation: ProbationReviewsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(probationListQuerySchema)) query: ProbationListQuery,
  ): Promise<ProbationReviewListItem[]> {
    return this.probation.list(user, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProbationReviewView> {
    return this.probation.get(user, id);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiBody(openApiBody(probationReviewSubmitSchema))
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(probationReviewSubmitSchema)) body: ProbationReviewSubmitInput,
  ): Promise<ProbationReviewView> {
    return this.probation.submit(user, id, body);
  }
}

/** A person's performance record, and a cycle's outcomes for the increment round (M3). */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('performance')
@Controller('tenant')
export class PerformanceRecordController {
  constructor(private readonly records: PerformanceRecordService) {}

  @Get('employees/:id/performance')
  record(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PerformanceRecord> {
    return this.records.record(user, id);
  }

  /** Cycles with released reviews, to read outcomes from. */
  @Get('performance/outcomes/cycles')
  @Permits('performance.manage')
  cycles(@CurrentUser() user: AuthUser): Promise<OutcomeCycle[]> {
    return this.records.outcomeCycles(user);
  }

  /** One row per released review in the cycle; `format=csv` for the spreadsheet. */
  @Get('performance/outcomes')
  @Permits('performance.manage')
  async outcomes(
    @CurrentUser() user: AuthUser,
    @Query(zod(outcomesQuerySchema)) query: OutcomesQuery,
  ): Promise<OutcomesView | StreamableFile> {
    if (query.format === 'json') return this.records.outcomes(user, query.cycleId);
    const file = await this.records.outcomesFile(user, query.cycleId);
    return fileResponse(Buffer.from(file.text), {
      contentType: 'text/csv; charset=utf-8',
      fileName: file.fileName,
      download: true,
    });
  }
}
