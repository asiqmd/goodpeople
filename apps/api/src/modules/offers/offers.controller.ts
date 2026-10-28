import {
  Body,
  Controller,
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
  offerHireSchema,
  offerListQuerySchema,
  offerSchema,
  offerUpdateSchema,
  type ApplicationOffers,
  type OfferHireInput,
  type OfferHirePrefill,
  type OfferHireResult,
  type OfferInput,
  type OfferUpdateInput,
  type OfferView,
  type TenantWithAccess,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { OfferHireService } from './offer-hire.service.js';
import { OffersService } from './offers.service.js';

/** Offers: drafted, approved over budget, sent to the candidate, and hired from. */
@ApiTags('recruitment')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('recruitment')
@Permits('recruitment.manage')
@Controller('tenant/recruitment/offers')
export class OffersController {
  constructor(
    private readonly offers: OffersService,
    private readonly hiring: OfferHireService,
  ) {}

  /** An application's offers and what a new one starts with. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(offerListQuerySchema)) query: z.infer<typeof offerListQuerySchema>,
  ): Promise<ApplicationOffers> {
    return this.offers.forApplication(user, query.applicationId);
  }

  @Post()
  @ApiBody(openApiBody(offerSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(offerSchema)) body: OfferInput,
  ): Promise<OfferView> {
    return this.offers.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<OfferView> {
    return this.offers.get(user, id);
  }

  @Patch(':id')
  @ApiBody(openApiBody(offerUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(offerUpdateSchema)) body: OfferUpdateInput,
  ): Promise<OfferView> {
    return this.offers.update(user, id, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferView> {
    return this.offers.submit(user, id);
  }

  @Post(':id/send')
  @HttpCode(200)
  send(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferView> {
    return this.offers.send(user, tenant, id);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferView> {
    return this.offers.withdraw(user, id);
  }

  /** The letter in the offer's language; once accepted, the copy the candidate accepted. */
  @Get(':id/letter')
  async letter(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const file = await this.offers.letter(user, id);
    return fileResponse(file.bytes, {
      contentType: 'application/pdf',
      fileName: file.fileName,
      download: false,
    });
  }

  @Get(':id/hire')
  @Permits('recruitment.manage', 'employees.write')
  hirePrefill(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferHirePrefill> {
    return this.hiring.prefill(user, tenant, id);
  }

  @Post(':id/hire')
  @Permits('recruitment.manage', 'employees.write')
  @ApiBody(openApiBody(offerHireSchema))
  hire(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(offerHireSchema)) body: OfferHireInput,
  ): Promise<OfferHireResult> {
    return this.hiring.hire(user, tenant, id, body);
  }
}
