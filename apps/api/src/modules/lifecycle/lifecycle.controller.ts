import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  probationExtensionSchema,
  resignationInputSchema,
  separationInputSchema,
  separationListQuerySchema,
  type LifecycleOverview,
  type ProbationExtensionInput,
  type ResignationInput,
  type SeparationInput,
  type SeparationView,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { HrOnly, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { LifecycleService } from './lifecycle.service.js';
import { SeparationsService } from './separations.service.js';

/** Probation, separations and what is coming up, for HR; resigning, for employees. */
@ApiTags('lifecycle')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@Controller('tenant')
export class LifecycleController {
  constructor(
    private readonly lifecycle: LifecycleService,
    private readonly separations: SeparationsService,
  ) {}

  @Get('lifecycle')
  @HrOnly()
  overview(): Promise<LifecycleOverview> {
    return this.lifecycle.overview();
  }

  @Post('employees/:id/probation/extend')
  @HrOnly()
  @ApiBody(openApiBody(probationExtensionSchema))
  extendProbation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(probationExtensionSchema)) body: ProbationExtensionInput,
  ) {
    return this.lifecycle.extendProbation(user, id, body);
  }

  @Get('separations')
  @HrOnly()
  list(
    @Query(zod(separationListQuerySchema)) query: z.infer<typeof separationListQuerySchema>,
  ): Promise<SeparationView[]> {
    return this.separations.list(query);
  }

  @Get('employees/:id/separations')
  @HrOnly()
  forEmployee(@Param('id', ParseUUIDPipe) id: string): Promise<SeparationView[]> {
    return this.separations.forEmployee(id);
  }

  /** HR records a separation; it stands approved and completes after the last working day. */
  @Post('employees/:id/separations')
  @HrOnly()
  @ApiBody(openApiBody(separationInputSchema))
  record(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(separationInputSchema)) body: SeparationInput,
  ): Promise<SeparationView> {
    return this.separations.record(user, id, body);
  }

  @Post('separations/:id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SeparationView> {
    return this.separations.cancel(user, id);
  }

  @Get('me/separations')
  mine(@CurrentUser() user: AuthUser): Promise<SeparationView[]> {
    return this.separations.mine(user);
  }

  /** The employee resigns; it goes to their manager, then HR. */
  @Post('me/resignation')
  @ApiBody(openApiBody(resignationInputSchema))
  resign(
    @CurrentUser() user: AuthUser,
    @Body(zod(resignationInputSchema)) body: ResignationInput,
  ): Promise<SeparationView> {
    return this.separations.resign(user, body);
  }
}
