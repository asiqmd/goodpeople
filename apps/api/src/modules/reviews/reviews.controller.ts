import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  acknowledgeSchema,
  finalRatingSchema,
  managerReviewSchema,
  peerAnswerSchema,
  peerChoicesQuerySchema,
  peerDecisionSchema,
  peerProposeSchema,
  selfReviewSchema,
  type AcknowledgeInput,
  type EmployeeRef,
  type FinalRatingInput,
  type ManagerReviewInput,
  type PeerAnswerInput,
  type PeerChoicesQuery,
  type PeerDecisionInput,
  type PeerInbox,
  type PeerProposeInput,
  type PeerRequestView,
  type PerformanceMe,
  type ReviewDetail,
  type SelfReviewInput,
  type TeamReviewItem,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { PeersService } from './peers.service.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Reviews and peer feedback for everyone in the workspace: the person, their manager, their
 * peers and HR each see their own part; anyone else finds nothing.
 */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('performance')
@Controller('tenant/performance')
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly peers: PeersService,
  ) {}

  /** What waits for the login, for the navigation and the landing page. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PerformanceMe> {
    return this.reviews.me(user);
  }

  /** The reviews the login writes or oversees as a manager. */
  @Get('team')
  team(@CurrentUser() user: AuthUser): Promise<TeamReviewItem[]> {
    return this.reviews.team(user);
  }

  @Get('reviews/:id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReviewDetail> {
    return this.reviews.detail(user, id);
  }

  @Put('reviews/:id/self')
  @ApiBody(openApiBody(selfReviewSchema))
  saveSelf(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(selfReviewSchema)) body: SelfReviewInput,
  ): Promise<ReviewDetail> {
    return this.reviews.saveSelf(user, id, body);
  }

  @Put('reviews/:id/manager')
  @ApiBody(openApiBody(managerReviewSchema))
  saveManager(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(managerReviewSchema)) body: ManagerReviewInput,
  ): Promise<ReviewDetail> {
    return this.reviews.saveManager(user, id, body);
  }

  @Put('reviews/:id/final-rating')
  @Permits('performance.manage')
  @ApiBody(openApiBody(finalRatingSchema))
  setFinal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(finalRatingSchema)) body: FinalRatingInput,
  ): Promise<ReviewDetail> {
    return this.reviews.setFinal(user, id, body);
  }

  @Post('reviews/:id/acknowledge')
  @HttpCode(200)
  @ApiBody(openApiBody(acknowledgeSchema))
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(acknowledgeSchema)) body: AcknowledgeInput,
  ): Promise<ReviewDetail> {
    return this.reviews.acknowledge(user, id, body);
  }

  /** Colleagues who could be named as peers on this review. */
  @Get('reviews/:id/peer-choices')
  peerChoices(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(peerChoicesQuerySchema)) query: PeerChoicesQuery,
  ): Promise<EmployeeRef[]> {
    return this.peers.choices(user, id, query.search);
  }

  @Post('reviews/:id/peers')
  @HttpCode(200)
  @ApiBody(openApiBody(peerProposeSchema))
  propose(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(peerProposeSchema)) body: PeerProposeInput,
  ): Promise<ReviewDetail> {
    return this.peers.propose(user, id, body.employeeIds);
  }

  @Get('peers')
  inbox(@CurrentUser() user: AuthUser): Promise<PeerInbox> {
    return this.peers.inbox(user);
  }

  @Get('peers/:id')
  request(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PeerRequestView> {
    return this.peers.request(user, id);
  }

  @Put('peers/:id')
  @ApiBody(openApiBody(peerAnswerSchema))
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(peerAnswerSchema)) body: PeerAnswerInput,
  ): Promise<PeerRequestView> {
    return this.peers.answer(user, id, body);
  }

  @Post('peers/:id/decision')
  @HttpCode(200)
  @ApiBody(openApiBody(peerDecisionSchema))
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(peerDecisionSchema)) body: PeerDecisionInput,
  ): Promise<ReviewDetail> {
    return this.peers.decide(user, id, body.approve);
  }
}
