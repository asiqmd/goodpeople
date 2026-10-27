import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  createIncidentSchema,
  incidentUpdateSchema,
  type CreateIncidentInput,
  type IncidentUpdateInput,
  type IncidentView,
  type OperationsView,
  type PublicStatus,
  type ReadinessView,
} from '@gp/shared';
import type { Response } from 'express';
import { CurrentUser, type PlatformUser } from '../../common/auth-user.js';
import { openApiBody, zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { PlatformGuard, PlatformRolesOnly } from '../platform-admin/platform.guard.js';
import { OperationsService } from './operations.service.js';
import { StatusService } from './status.service.js';

/** The public status page's data, and readiness for load balancers and health checks. */
@ApiTags('status')
@Public()
@Controller()
export class StatusController {
  constructor(
    private readonly status: StatusService,
    private readonly operations: OperationsService,
  ) {}

  @Get('status')
  publicStatus(): Promise<PublicStatus> {
    return this.status.publicStatus();
  }

  /** 200 when the database, the document store and Chromium all work; 503 otherwise. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessView> {
    const result = await this.operations.readiness();
    if (result.status !== 'ready') res.status(503);
    return result;
  }
}

/** Incidents, maintenance and operations in the console, for operations and support staff. */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformGuard)
@PlatformRolesOnly('platform_ops', 'support')
@Controller('platform')
export class PlatformStatusController {
  constructor(
    private readonly status: StatusService,
    private readonly operations: OperationsService,
  ) {}

  @Get('status/incidents')
  incidents(): Promise<IncidentView[]> {
    return this.status.incidents();
  }

  @Post('status/incidents')
  @ApiBody(openApiBody(createIncidentSchema))
  create(
    @CurrentUser() actor: PlatformUser,
    @Body(zod(createIncidentSchema)) body: CreateIncidentInput,
  ): Promise<IncidentView> {
    return this.status.create(actor, body);
  }

  @Post('status/incidents/:id/updates')
  @ApiBody(openApiBody(incidentUpdateSchema))
  postUpdate(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(incidentUpdateSchema)) body: IncidentUpdateInput,
  ): Promise<IncidentView> {
    return this.status.postUpdate(actor, id, body);
  }

  @Get('operations')
  operationsOverview(): Promise<OperationsView> {
    return this.operations.overview();
  }
}
