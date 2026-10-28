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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  applicationNoteSchema,
  candidateAddSchema,
  candidateListQuerySchema,
  candidateUpdateSchema,
  interviewerQuerySchema,
  interviewSchema,
  stageMoveSchema,
  type ApplicationDetail,
  type ApplicationNoteInput,
  type CandidateAddInput,
  type CandidateAdded,
  type CandidateDetail,
  type CandidateListItem,
  type CandidateListQuery,
  type CandidateUpdateInput,
  type CvContacts,
  type EmployeeRef,
  type InterviewerQuery,
  type InterviewInput,
  type InterviewView,
  type Page,
  type PipelineView,
  type RecruitmentMe,
  type StageMoveInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { CandidatesService } from './candidates.service.js';
import { CV_UPLOAD, CvLimits } from './cv-upload.js';
import { InterviewsService } from './interviews.service.js';
import { PipelineService } from './pipeline.service.js';

const cvFile = (file: { fileName: string; contentType: string; bytes: Buffer }) =>
  fileResponse(file.bytes, {
    contentType: file.contentType,
    fileName: file.fileName,
    download: true,
  });

/**
 * Candidates and their applications through the pipeline. Those who manage recruitment see
 * every opening of their companies; an opening's hiring manager sees and moves its
 * applications and schedules interviews. Everyone else finds nothing.
 */
@ApiTags('recruitment')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('recruitment')
@Controller('tenant/recruitment')
export class ApplicationsController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly candidates: CandidatesService,
    private readonly interviews: InterviewsService,
  ) {}

  /** What the login has to do with recruitment, for the navigation. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<RecruitmentMe> {
    return this.pipeline.me(user);
  }

  @Get('openings/:id/pipeline')
  board(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PipelineView> {
    return this.pipeline.pipeline(user, id);
  }

  // ── Applications ───────────────────────────────────────────────────────────

  @Get('applications/:id')
  application(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationDetail> {
    return this.pipeline.application(user, id);
  }

  @Post('applications/:id/stage')
  @HttpCode(200)
  @ApiBody(openApiBody(stageMoveSchema))
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(stageMoveSchema)) body: StageMoveInput,
  ): Promise<ApplicationDetail> {
    return this.pipeline.move(user, id, body);
  }

  @Post('applications/:id/notes')
  @ApiBody(openApiBody(applicationNoteSchema))
  note(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(applicationNoteSchema)) body: ApplicationNoteInput,
  ): Promise<ApplicationDetail> {
    return this.pipeline.note(user, id, body.note);
  }

  /** The candidate's CV, also for those interviewing them. */
  @Get('applications/:id/cv')
  async applicationCv(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return cvFile(await this.pipeline.cv(user, id));
  }

  @Post('applications/:id/interviews')
  @ApiBody(openApiBody(interviewSchema))
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(interviewSchema)) body: InterviewInput,
  ): Promise<InterviewView> {
    return this.interviews.schedule(user, id, body);
  }

  /** Employees with logins, to put on an interview panel. */
  @Get('applications/:id/interviewers')
  interviewers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(interviewerQuerySchema)) query: InterviewerQuery,
  ): Promise<EmployeeRef[]> {
    return this.interviews.interviewerChoices(user, id, query.search);
  }

  // ── Candidates ─────────────────────────────────────────────────────────────

  @Get('candidates')
  @Permits('recruitment.manage')
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(candidateListQuerySchema)) query: CandidateListQuery,
  ): Promise<Page<CandidateListItem>> {
    return this.candidates.list(user, query);
  }

  /** Adds a person to an opening by hand, with their CV as the file `cv`. */
  @Post('candidates')
  @Permits('recruitment.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(CvLimits, FileInterceptor('cv', CV_UPLOAD))
  add(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(zod(candidateAddSchema)) body: CandidateAddInput,
  ): Promise<CandidateAdded> {
    return this.candidates.add(user, body, file);
  }

  @Get('candidates/:id')
  @Permits('recruitment.manage')
  candidate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CandidateDetail> {
    return this.candidates.get(user, id);
  }

  @Patch('candidates/:id')
  @Permits('recruitment.manage')
  @ApiBody(openApiBody(candidateUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(candidateUpdateSchema)) body: CandidateUpdateInput,
  ): Promise<CandidateDetail> {
    return this.candidates.update(user, id, body);
  }

  /** Erases the person on their request; refused for someone who was hired. */
  @Post('candidates/:id/erase')
  @HttpCode(200)
  @Permits('recruitment.manage')
  erase(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CandidateDetail> {
    return this.candidates.erase(user, id);
  }

  @Get('candidates/:id/cv')
  @Permits('recruitment.manage')
  async candidateCv(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return cvFile(await this.candidates.cv(user, id));
  }

  /** The name, email and mobile number a CV gives, for HR to check. */
  @Post('cv/parse')
  @HttpCode(200)
  @Permits('recruitment.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(CvLimits, FileInterceptor('cv', CV_UPLOAD))
  parse(@UploadedFile() file: Express.Multer.File | undefined): Promise<CvContacts> {
    return this.candidates.parse(file);
  }
}
