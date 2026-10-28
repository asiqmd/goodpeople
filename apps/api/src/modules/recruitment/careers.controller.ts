import {
  Body,
  Controller,
  Get,
  Injectable,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseInterceptors,
  type CallHandler,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  careersApplySchema,
  CV_MAX_BYTES,
  type CareersApplied,
  type CareersApplyInput,
  type CareersJob,
  type CareersPageView,
} from '@gp/shared';
import { catchError, throwError, type Observable } from 'rxjs';
import { z } from 'zod';
import { openApiBody, zod } from '../../common/zod.js';
import { Public } from '../auth/jwt-auth.guard.js';
import { CareersService, cvTooLarge } from './careers.service.js';

const slugParam = zod(z.string().trim().min(1).max(60));
/** A job address that is not a job is not found, like one of another workspace. */
const jobParam = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException() });

/** Gives the upload's own size limit (from multer) the code the web translates. */
@Injectable()
class CvLimits implements NestInterceptor {
  intercept(_: unknown, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof PayloadTooLargeException ? cvTooLarge() : error)),
        ),
      );
  }
}

/**
 * A workspace's careers page: its open jobs, each job, and applying with a CV, without
 * signing in. Not found unless the workspace has recruitment and turned its careers page on.
 */
@ApiTags('careers')
@Public()
@Controller('careers/:slug')
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  @Get()
  page(@Param('slug', slugParam) slug: string, @Ip() ip: string): Promise<CareersPageView> {
    return this.careers.page(slug, ip);
  }

  @Get('jobs/:id')
  job(
    @Param('slug', slugParam) slug: string,
    @Param('id', jobParam) id: string,
    @Ip() ip: string,
  ): Promise<CareersJob> {
    return this.careers.job(slug, id, ip);
  }

  /** Multipart: the form's fields and the CV as `cv`. Answers without echoing anything. */
  @Post('jobs/:id/apply')
  @ApiConsumes('multipart/form-data')
  @ApiBody(openApiBody(careersApplySchema))
  @UseInterceptors(
    CvLimits,
    FileInterceptor('cv', { limits: { fileSize: CV_MAX_BYTES, files: 1, fields: 20 } }),
  )
  apply(
    @Param('slug', slugParam) slug: string,
    @Param('id', jobParam) id: string,
    @Body(zod(careersApplySchema)) body: CareersApplyInput,
    @UploadedFile() cv: Express.Multer.File | undefined,
    @Ip() ip: string,
  ): Promise<CareersApplied> {
    return this.careers.apply(slug, id, body, cv, ip);
  }
}
