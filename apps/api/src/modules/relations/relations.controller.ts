import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  checkOffQuerySchema,
  committeeInputSchema,
  committeeMeetingInputSchema,
  committeeMeetingUpdateSchema,
  committeeMemberEndSchema,
  committeeMemberInputSchema,
  committeeUpdateSchema,
  decisionDoneSchema,
  tradeUnionInputSchema,
  tradeUnionUpdateSchema,
  unionMemberEndSchema,
  unionMemberInputSchema,
  unionMembersBulkSchema,
  unionMemberUpdateSchema,
  type CheckOffQuery,
  type CheckOffReport,
  type CommitteeInput,
  type CommitteeMeetingInput,
  type CommitteeMeetingUpdate,
  type CommitteeMemberEnd,
  type CommitteeMemberInput,
  type CommitteeSummaryView,
  type CommitteeUpdate,
  type CommitteeView,
  type DecisionDoneInput,
  type RelationsCheckResult,
  type RelationsStatusView,
  type TradeUnionInput,
  type TradeUnionUpdate,
  type TradeUnionView,
  type UnionBulkResult,
  type UnionListView,
  type UnionMemberEnd,
  type UnionMemberInput,
  type UnionMembersBulkInput,
  type UnionMemberUpdate,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard } from '../entitlements/guards.js';
import { CommitteesService } from './committees.service.js';
import { RelationsAlertsService } from './relations-alerts.service.js';
import { UnionsService } from './unions.service.js';

/** Committees the Labour Act requires, trade unions and their check-off. */
@ApiTags('relations')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Permits('compliance.manage')
@Controller('tenant/relations')
export class RelationsController {
  constructor(
    private readonly committees: CommitteesService,
    private readonly unions: UnionsService,
    private readonly alerts: RelationsAlertsService,
  ) {}

  /** Each establishment's workforce and the committees the law requires there, checked. */
  @Get('status')
  status(): Promise<RelationsStatusView> {
    return this.committees.status();
  }

  /** Raises and resolves the committee alerts now (also run daily). */
  @Post('check')
  @HttpCode(200)
  check(): Promise<RelationsCheckResult> {
    return this.alerts.check();
  }

  // ── Committees ─────────────────────────────────────────────────────────────

  @Get('committees')
  listCommittees(): Promise<CommitteeSummaryView[]> {
    return this.committees.list();
  }

  @Post('committees')
  @ApiBody(openApiBody(committeeInputSchema))
  createCommittee(
    @CurrentUser() user: AuthUser,
    @Body(zod(committeeInputSchema)) body: CommitteeInput,
  ): Promise<CommitteeView> {
    return this.committees.create(user, body);
  }

  @Get('committees/:id')
  committee(@Param('id', ParseUUIDPipe) id: string): Promise<CommitteeView> {
    return this.committees.get(id);
  }

  @Patch('committees/:id')
  @ApiBody(openApiBody(committeeUpdateSchema))
  updateCommittee(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(committeeUpdateSchema)) body: CommitteeUpdate,
  ): Promise<CommitteeView> {
    return this.committees.update(user, id, body);
  }

  @Delete('committees/:id')
  @HttpCode(204)
  removeCommittee(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.committees.remove(user, id);
  }

  @Post('committees/:id/members')
  @ApiBody(openApiBody(committeeMemberInputSchema))
  addCommitteeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(committeeMemberInputSchema)) body: CommitteeMemberInput,
  ): Promise<CommitteeView> {
    return this.committees.addMember(user, id, body);
  }

  @Post('committees/:id/members/:memberId/end')
  @HttpCode(200)
  @ApiBody(openApiBody(committeeMemberEndSchema))
  endCommitteeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(zod(committeeMemberEndSchema)) body: CommitteeMemberEnd,
  ): Promise<CommitteeView> {
    return this.committees.endMember(user, id, memberId, body);
  }

  @Post('committees/:id/meetings')
  @ApiBody(openApiBody(committeeMeetingInputSchema))
  addMeeting(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(committeeMeetingInputSchema)) body: CommitteeMeetingInput,
  ): Promise<CommitteeView> {
    return this.committees.addMeeting(user, id, body);
  }

  @Patch('committees/:id/meetings/:meetingId')
  @ApiBody(openApiBody(committeeMeetingUpdateSchema))
  updateMeeting(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body(zod(committeeMeetingUpdateSchema)) body: CommitteeMeetingUpdate,
  ): Promise<CommitteeView> {
    return this.committees.updateMeeting(user, id, meetingId, body);
  }

  /** Marks one of a meeting's decisions done (or not), by its place in the list. */
  @Patch('committees/:id/meetings/:meetingId/decisions/:index')
  @ApiBody(openApiBody(decisionDoneSchema))
  setDecision(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('index', ParseIntPipe) index: number,
    @Body(zod(decisionDoneSchema)) body: DecisionDoneInput,
  ): Promise<CommitteeView> {
    return this.committees.setDecision(user, id, meetingId, index, body.done);
  }

  // ── Trade unions ───────────────────────────────────────────────────────────

  @Get('unions')
  listUnions(@CurrentUser() user: AuthUser): Promise<UnionListView> {
    return this.unions.list(user);
  }

  @Post('unions')
  @ApiBody(openApiBody(tradeUnionInputSchema))
  createUnion(
    @CurrentUser() user: AuthUser,
    @Body(zod(tradeUnionInputSchema)) body: TradeUnionInput,
  ): Promise<TradeUnionView> {
    return this.unions.create(user, body);
  }

  /** A month's subscriptions deducted from wages, with when they are due to each union. */
  @Get('check-off')
  checkOff(
    @CurrentUser() user: AuthUser,
    @Query(zod(checkOffQuerySchema)) query: CheckOffQuery,
  ): Promise<CheckOffReport> {
    return this.unions.checkOff(user, query.month, query.unionId);
  }

  @Get('check-off/csv')
  async checkOffCsv(
    @CurrentUser() user: AuthUser,
    @Query(zod(checkOffQuerySchema)) query: CheckOffQuery,
  ): Promise<StreamableFile> {
    const file = await this.unions.checkOffCsv(user, query.month, query.unionId);
    return fileResponse(Buffer.from(file.text), {
      contentType: 'text/csv; charset=utf-8',
      fileName: file.fileName,
      download: true,
    });
  }

  @Get('unions/:id')
  union(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TradeUnionView> {
    return this.unions.get(user, id);
  }

  @Patch('unions/:id')
  @ApiBody(openApiBody(tradeUnionUpdateSchema))
  updateUnion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(tradeUnionUpdateSchema)) body: TradeUnionUpdate,
  ): Promise<TradeUnionView> {
    return this.unions.update(user, id, body);
  }

  @Delete('unions/:id')
  @HttpCode(204)
  removeUnion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.unions.remove(user, id);
  }

  @Post('unions/:id/members')
  @ApiBody(openApiBody(unionMemberInputSchema))
  addUnionMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(unionMemberInputSchema)) body: UnionMemberInput,
  ): Promise<TradeUnionView> {
    return this.unions.addMember(user, id, body);
  }

  @Post('unions/:id/members/bulk')
  @ApiBody(openApiBody(unionMembersBulkSchema))
  addUnionMembers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(unionMembersBulkSchema)) body: UnionMembersBulkInput,
  ): Promise<UnionBulkResult> {
    return this.unions.addMembers(user, id, body);
  }

  /** The member's role, or the date they consented to check-off (null: they pay directly). */
  @Patch('unions/:id/members/:memberId')
  @ApiBody(openApiBody(unionMemberUpdateSchema))
  updateUnionMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(zod(unionMemberUpdateSchema)) body: UnionMemberUpdate,
  ): Promise<TradeUnionView> {
    return this.unions.updateMember(user, id, memberId, body);
  }

  @Post('unions/:id/members/:memberId/end')
  @HttpCode(200)
  @ApiBody(openApiBody(unionMemberEndSchema))
  endUnionMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(zod(unionMemberEndSchema)) body: UnionMemberEnd,
  ): Promise<TradeUnionView> {
    return this.unions.endMember(user, id, memberId, body);
  }
}
