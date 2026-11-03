import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  announcementSchema,
  recognitionSchema,
  serviceReasonSchema,
  serviceScopeSchema,
  surveyResponseSchema,
  surveySchema,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { EngagementService } from './engagement.service.js';
@ApiTags('engagement')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@Controller('tenant/engagement')
export class EngagementController {
  constructor(private readonly service: EngagementService) {}
  @Patch('surveys/:id')
  @Permits('engagement.manage')
  @ApiBody(openApiBody(surveySchema))
  updateSurvey(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(surveySchema)) b: z.infer<typeof surveySchema>,
  ) {
    return this.service.updateSurvey(u, id, b);
  }
  @Patch('announcements/:id')
  @Permits('engagement.manage')
  @ApiBody(openApiBody(announcementSchema))
  updateAnnouncement(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(announcementSchema)) b: z.infer<typeof announcementSchema>,
  ) {
    return this.service.updateAnnouncement(u, id, b);
  }
  @Get('me') me(@CurrentUser() u: AuthUser) {
    return this.service.me(u);
  }
  @Get('surveys') surveys(@CurrentUser() u: AuthUser) {
    return this.service.surveys(u);
  }
  @Get('surveys/:id') survey(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.survey(u, id);
  }
  @Post('surveys')
  @Permits('engagement.manage')
  @ApiBody(openApiBody(surveySchema))
  createSurvey(
    @CurrentUser() u: AuthUser,
    @Body(zod(surveySchema)) b: z.infer<typeof surveySchema>,
  ) {
    return this.service.createSurvey(u, b);
  }
  @Post('surveys/:id/publish')
  @HttpCode(200)
  @Permits('engagement.manage')
  publishSurvey(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.publishSurvey(u, id);
  }
  @Post('surveys/:id/respond')
  @HttpCode(200)
  @ApiBody(openApiBody(surveyResponseSchema))
  respond(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(surveyResponseSchema)) b: z.infer<typeof surveyResponseSchema>,
  ) {
    return this.service.respond(u, id, b);
  }
  @Post('surveys/:id/close')
  @HttpCode(200)
  @Permits('engagement.manage')
  @ApiBody(openApiBody(serviceReasonSchema))
  closeSurvey(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(serviceReasonSchema)) b: { reason: string },
  ) {
    return this.service.closeSurvey(u, id, b.reason);
  }
  @Get('announcements') announcements(@CurrentUser() u: AuthUser) {
    return this.service.announcements(u);
  }
  @Get('announcements/:id') announcement(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.announcement(u, id);
  }
  @Post('announcements')
  @Permits('engagement.manage')
  @ApiBody(openApiBody(announcementSchema))
  createAnnouncement(
    @CurrentUser() u: AuthUser,
    @Body(zod(announcementSchema)) b: z.infer<typeof announcementSchema>,
  ) {
    return this.service.createAnnouncement(u, b);
  }
  @Post('announcements/:id/publish')
  @HttpCode(200)
  @Permits('engagement.manage')
  publishAnnouncement(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.publishAnnouncement(u, id);
  }
  @Post('announcements/:id/acknowledge')
  @HttpCode(200)
  acknowledge(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.acknowledge(u, id);
  }
  @Post('announcements/:id/retire')
  @HttpCode(200)
  @Permits('engagement.manage')
  @ApiBody(openApiBody(serviceReasonSchema))
  retireAnnouncement(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(serviceReasonSchema)) b: { reason: string },
  ) {
    return this.service.retireAnnouncement(u, id, b.reason);
  }
  @Get('recognition') recognition(
    @CurrentUser() u: AuthUser,
    @Query(zod(serviceScopeSchema)) q: z.infer<typeof serviceScopeSchema>,
  ) {
    return this.service.recognition(u, q.legalEntityId);
  }
  @Post('recognition')
  @ApiBody(openApiBody(recognitionSchema))
  createRecognition(
    @CurrentUser() u: AuthUser,
    @Body(zod(recognitionSchema)) b: z.infer<typeof recognitionSchema>,
  ) {
    return this.service.createRecognition(u, b);
  }
  @Post('recognition/:id/hide')
  @HttpCode(204)
  @ApiBody(openApiBody(serviceReasonSchema))
  hideRecognition(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(serviceReasonSchema)) b: { reason: string },
  ) {
    return this.service.hideRecognition(u, id, b.reason);
  }
}
