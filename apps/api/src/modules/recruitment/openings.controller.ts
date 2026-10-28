import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  openingListQuerySchema,
  openingPostSchema,
  openingSchema,
  openingUpdateSchema,
  recruitmentSettingsSchema,
  type OpeningDetail,
  type OpeningInput,
  type OpeningListItem,
  type OpeningListQuery,
  type OpeningPostInput,
  type OpeningUpdateInput,
  type RecruitmentSettingsInput,
  type RecruitmentSettingsView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { OpeningsService } from './openings.service.js';
import { RecruitmentSettingsService } from './recruitment-settings.service.js';

/**
 * Openings and their job posts. HR sees and changes every opening in its companies; a line
 * manager drafts openings for their own team and sees those they drafted or hire for (the
 * service checks who may do what).
 */
@ApiTags('recruitment')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('recruitment')
@Controller('tenant/recruitment/openings')
export class OpeningsController {
  constructor(private readonly openings: OpeningsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(openingListQuerySchema)) query: OpeningListQuery,
  ): Promise<OpeningListItem[]> {
    return this.openings.list(user, query);
  }

  @Post()
  @ApiBody(openApiBody(openingSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(openingSchema)) body: OpeningInput,
  ): Promise<OpeningDetail> {
    return this.openings.create(user, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpeningDetail> {
    return this.openings.get(user, id);
  }

  /** A draft, or a rejected opening before it is submitted again. */
  @Patch(':id')
  @ApiBody(openApiBody(openingUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(openingUpdateSchema)) body: OpeningUpdateInput,
  ): Promise<OpeningDetail> {
    return this.openings.update(user, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpeningDetail> {
    return this.openings.submit(user, id);
  }

  /** The job post: title and description in English and/or Bangla, and the closing date. */
  @Put(':id/post')
  @Permits('recruitment.manage')
  @ApiBody(openApiBody(openingPostSchema))
  savePost(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(openingPostSchema)) body: OpeningPostInput,
  ): Promise<OpeningDetail> {
    return this.openings.savePost(user, id, body);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Permits('recruitment.manage')
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpeningDetail> {
    return this.openings.publish(user, id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @Permits('recruitment.manage')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpeningDetail> {
    return this.openings.close(user, id);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @Permits('recruitment.manage')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpeningDetail> {
    return this.openings.reopen(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpeningDetail> {
    return this.openings.cancel(user, id);
  }
}

/** The careers page (on or off, its introduction) and how long candidates' data is kept. */
@ApiTags('recruitment')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('recruitment')
@Permits('recruitment.manage')
@Controller('tenant/recruitment/settings')
export class RecruitmentSettingsController {
  constructor(private readonly settings: RecruitmentSettingsService) {}

  @Get()
  get(): Promise<RecruitmentSettingsView> {
    return this.settings.get();
  }

  @Put()
  @ApiBody(openApiBody(recruitmentSettingsSchema))
  save(
    @CurrentUser() user: AuthUser,
    @Body(zod(recruitmentSettingsSchema)) body: RecruitmentSettingsInput,
  ): Promise<RecruitmentSettingsView> {
    return this.settings.save(user, body);
  }
}
