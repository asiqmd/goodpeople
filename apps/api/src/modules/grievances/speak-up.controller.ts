import { Body, Controller, Get, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  grievanceFollowUpSchema,
  grievanceReporterReplySchema,
  grievanceSubmitSchema,
  type GrievanceFollowUp,
  type GrievanceSubmitted,
  type SpeakUpInfo,
} from '@gp/shared';
import { z } from 'zod';
import { openApiBody, zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { SpeakUpService } from './speak-up.service.js';

const slugParam = zod(z.string().trim().min(1).max(60));

/**
 * A workspace's speak-up page: any worker raises a grievance and follows it up, without
 * signing in. The address is used for rate limits in memory only, never stored or logged.
 */
@ApiTags('speak-up')
@Public()
@Controller('speak-up/:slug')
export class SpeakUpController {
  constructor(private readonly speakUp: SpeakUpService) {}

  @Get()
  info(@Param('slug', slugParam) slug: string, @Ip() ip: string): Promise<SpeakUpInfo> {
    return this.speakUp.info(slug, ip);
  }

  @Post('grievances')
  @ApiBody(openApiBody(grievanceSubmitSchema))
  submit(
    @Param('slug', slugParam) slug: string,
    @Body(zod(grievanceSubmitSchema)) body: z.output<typeof grievanceSubmitSchema>,
    @Ip() ip: string,
  ): Promise<GrievanceSubmitted> {
    return this.speakUp.submit(slug, body, ip);
  }

  /** The reference and PIN go in the body, never in an address that could be logged. */
  @Post('follow-up')
  @HttpCode(200)
  @ApiBody(openApiBody(grievanceFollowUpSchema))
  followUp(
    @Param('slug', slugParam) slug: string,
    @Body(zod(grievanceFollowUpSchema)) body: z.output<typeof grievanceFollowUpSchema>,
    @Ip() ip: string,
  ): Promise<GrievanceFollowUp> {
    return this.speakUp.followUp(slug, body, ip);
  }

  @Post('replies')
  @ApiBody(openApiBody(grievanceReporterReplySchema))
  reply(
    @Param('slug', slugParam) slug: string,
    @Body(zod(grievanceReporterReplySchema)) body: z.output<typeof grievanceReporterReplySchema>,
    @Ip() ip: string,
  ): Promise<GrievanceFollowUp> {
    return this.speakUp.reply(slug, body, ip);
  }
}
