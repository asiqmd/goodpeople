import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  compensationBudgetSchema,
  compensationCreateSchema,
  compensationProposalSchema,
  type CompensationCreateInput,
  type CompensationProposalInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { CompensationService } from './compensation.service.js';

@ApiTags('compensation')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('performance', 'payroll')
@Controller('tenant/compensation')
export class CompensationController {
  constructor(private readonly service: CompensationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @Permits('compensation.manage')
  @ApiBody(openApiBody(compensationCreateSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(compensationCreateSchema)) body: CompensationCreateInput,
  ) {
    return this.service.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id/lines/:lineId')
  @ApiBody(openApiBody(compensationProposalSchema))
  propose(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(zod(compensationProposalSchema)) body: CompensationProposalInput,
  ) {
    return this.service.propose(user, id, lineId, body);
  }

  @Patch(':id/budgets')
  @Permits('compensation.manage')
  @ApiBody(openApiBody(compensationBudgetSchema))
  budgets(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(compensationBudgetSchema)) body: Pick<CompensationCreateInput, 'budgets'>,
  ) {
    return this.service.budgets(user, id, body.budgets);
  }

  @Post(':id/export')
  @HttpCode(200)
  @Permits('compensation.manage')
  export(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.export(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permits('compensation.manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(user, id);
  }
}
