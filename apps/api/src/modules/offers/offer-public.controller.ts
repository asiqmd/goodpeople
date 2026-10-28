import { Body, Controller, Get, HttpCode, Ip, Param, Post, StreamableFile } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  offerAcceptSchema,
  offerDeclineSchema,
  type OfferAcceptInput,
  type OfferDeclineInput,
  type PublicOfferView,
} from '@gp/shared';
import { z } from 'zod';
import { openApiBody, zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { fileResponse } from '../documents/documents.controller.js';
import { OfferPublicService } from './offer-public.service.js';

const slugParam = zod(z.string().trim().min(1).max(60));
const tokenParam = zod(z.string().max(100));

/** The candidate's private link: the offer, its letter, and their answer, without signing in. */
@ApiTags('offers')
@Public()
@Controller('offers/:slug/:token')
export class OfferPublicController {
  constructor(private readonly offers: OfferPublicService) {}

  @Get()
  view(
    @Param('slug', slugParam) slug: string,
    @Param('token', tokenParam) token: string,
    @Ip() ip: string,
  ): Promise<PublicOfferView> {
    return this.offers.view(slug, token, ip);
  }

  @Get('letter')
  async letter(
    @Param('slug', slugParam) slug: string,
    @Param('token', tokenParam) token: string,
    @Ip() ip: string,
  ): Promise<StreamableFile> {
    const file = await this.offers.letter(slug, token, ip);
    return fileResponse(file.bytes, {
      contentType: 'application/pdf',
      fileName: file.fileName,
      download: false,
    });
  }

  @Post('accept')
  @HttpCode(200)
  @ApiBody(openApiBody(offerAcceptSchema))
  accept(
    @Param('slug', slugParam) slug: string,
    @Param('token', tokenParam) token: string,
    @Body(zod(offerAcceptSchema)) body: OfferAcceptInput,
    @Ip() ip: string,
  ): Promise<PublicOfferView> {
    return this.offers.accept(slug, token, body, ip);
  }

  @Post('decline')
  @HttpCode(200)
  @ApiBody(openApiBody(offerDeclineSchema))
  decline(
    @Param('slug', slugParam) slug: string,
    @Param('token', tokenParam) token: string,
    @Body(zod(offerDeclineSchema)) body: OfferDeclineInput,
    @Ip() ip: string,
  ): Promise<PublicOfferView> {
    return this.offers.decline(slug, token, body, ip);
  }
}
