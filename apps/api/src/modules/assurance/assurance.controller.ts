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
import { z } from 'zod';
import {
  assuranceProgramInputSchema,
  assuranceEventInputSchema,
  type AssuranceProgramInput,
  type AssuranceEventInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { zod } from '../../common/zod.js';
import { PlatformGuard, SuperAdminOnly } from '../platform-admin/platform.guard.js';
import { AssuranceService } from './assurance.service.js';
@Controller('platform/assurance')
@UseGuards(PlatformGuard)
@SuperAdminOnly()
export class AssuranceController {
  constructor(private service: AssuranceService) {}
  @Get() overview(
    @CurrentUser() a: AuthUser,
    @Query(zod(z.object({ program: z.uuid().optional() }).strict())) q: { program?: string },
  ) {
    return this.service.overview(a, q.program);
  }
  @Post('step-up') step(
    @CurrentUser() a: AuthUser,
    @Body(zod(z.object({ code: z.string().min(6).max(20) }).strict())) b: { code: string },
  ) {
    return this.service.stepUp(a, b.code);
  }
  @Post('programs') create(
    @CurrentUser() a: AuthUser,
    @Body(zod(assuranceProgramInputSchema)) input: AssuranceProgramInput,
  ) {
    return this.service.create(a, input);
  }
  @Get('programs/:id') get(@CurrentUser() a: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(a, id);
  }
  @Post('programs/:id/events') event(
    @CurrentUser() a: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      zod(
        z
          .object({ expectedVersion: z.number().int().min(0), input: assuranceEventInputSchema })
          .strict(),
      ),
    )
    b: { expectedVersion: number; input: AssuranceEventInput },
  ) {
    return this.service.append(a, id, b.expectedVersion, b.input);
  }
  @Get('programs/:id/export') export(
    @CurrentUser() a: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.export(a, id);
  }
}
