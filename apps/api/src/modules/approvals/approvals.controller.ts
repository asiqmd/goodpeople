import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { decisionSchema, type ApprovalItem, type DecisionInput } from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard } from '../entitlements/guards.js';
import { ApprovalsService } from './approvals.service.js';

/** One inbox for everything waiting on the signed-in user: leave, corrections, resignations. */
@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Controller('tenant')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('approvals/count')
  async count(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    return { count: await this.approvals.count(user) };
  }

  @Get('approvals')
  inbox(@CurrentUser() user: AuthUser): Promise<ApprovalItem[]> {
    return this.approvals.inbox(user);
  }

  /** Returns what was decided: the leave request, correction or separation. */
  @Post('approvals/:stepId/approve')
  @ApiBody(openApiBody(decisionSchema))
  approve(
    @CurrentUser() user: AuthUser,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(zod(decisionSchema)) body: DecisionInput,
  ): Promise<unknown> {
    return this.approvals.decide(user, stepId, 'approved', body);
  }

  @Post('approvals/:stepId/reject')
  @ApiBody(openApiBody(decisionSchema))
  reject(
    @CurrentUser() user: AuthUser,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(zod(decisionSchema)) body: DecisionInput,
  ): Promise<unknown> {
    return this.approvals.decide(user, stepId, 'rejected', body);
  }
}
