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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  fireDrillSchema,
  learningAttendanceSchema,
  learningCourseSchema,
  learningCoverageQuerySchema,
  learningEnrolSchema,
  learningLanguageSchema,
  learningReasonSchema,
  learningRequirementSchema,
  learningRetireSchema,
  learningSessionSchema,
  type FireDrillInput,
  type LearningAttendanceInput,
  type LearningCourseInput,
  type LearningCoverageQuery,
  type LearningRequirementInput,
  type LearningSessionInput,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { LearningService } from './learning.service.js';
const activeSchema = z.object({ isActive: z.boolean() });
@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('lms')
@Controller('tenant/learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}
  @Get('me') me(@CurrentUser() u: AuthUser) {
    return this.learning.me(u);
  }
  @Get('courses') courses() {
    return this.learning.courses();
  }
  @Post('courses')
  @Permits('learning.manage')
  @ApiBody(openApiBody(learningCourseSchema))
  createCourse(
    @CurrentUser() u: AuthUser,
    @Body(zod(learningCourseSchema)) b: LearningCourseInput,
  ) {
    return this.learning.createCourse(u, b);
  }
  @Patch('courses/:id') @Permits('learning.manage') archive(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(activeSchema)) b: { isActive: boolean },
  ) {
    return this.learning.archiveCourse(u, id, b.isActive);
  }
  @Get('requirements') @Permits('learning.manage') requirements(@CurrentUser() u: AuthUser) {
    return this.learning.requirements(u);
  }
  @Post('requirements')
  @Permits('learning.manage')
  @ApiBody(openApiBody(learningRequirementSchema))
  createRequirement(
    @CurrentUser() u: AuthUser,
    @Body(zod(learningRequirementSchema)) b: LearningRequirementInput,
  ) {
    return this.learning.createRequirement(u, b);
  }
  @Post('requirements/:id/retire') @HttpCode(204) @Permits('learning.manage') retire(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(learningRetireSchema)) b: { effectiveTo: string; reason: string },
  ) {
    return this.learning.retireRequirement(u, id, b.effectiveTo, b.reason);
  }
  @Get('coverage') coverage(
    @CurrentUser() u: AuthUser,
    @Query(zod(learningCoverageQuerySchema)) q: LearningCoverageQuery,
  ) {
    return this.learning.coverage(u, q);
  }
  @Get('team') team(
    @CurrentUser() u: AuthUser,
    @Query(zod(learningCoverageQuerySchema)) q: LearningCoverageQuery,
  ) {
    return this.learning.coverage(u, q, true);
  }
  @Get('sessions') sessions(@CurrentUser() u: AuthUser) {
    return this.learning.sessions(u);
  }
  @Post('sessions')
  @Permits('learning.manage')
  @ApiBody(openApiBody(learningSessionSchema))
  createSession(
    @CurrentUser() u: AuthUser,
    @Body(zod(learningSessionSchema)) b: LearningSessionInput,
  ) {
    return this.learning.createSession(u, b);
  }
  @Get('sessions/:id') session(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.session(u, id);
  }
  @Post('sessions/:id/enrol') @HttpCode(200) enrol(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(learningEnrolSchema)) b: { employeeId?: string; employeeCode?: string },
  ) {
    return this.learning.enrol(u, id, b.employeeId, b.employeeCode);
  }
  @Post('sessions/:id/withdraw') @HttpCode(200) withdraw(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(learningEnrolSchema)) b: { employeeId?: string },
  ) {
    return this.learning.withdraw(u, id, b.employeeId);
  }
  @Post('sessions/:id/complete')
  @HttpCode(200)
  @Permits('learning.manage')
  @ApiBody(openApiBody(learningAttendanceSchema))
  complete(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(learningAttendanceSchema)) b: LearningAttendanceInput,
  ) {
    return this.learning.complete(u, id, b);
  }
  @Post('sessions/:id/cancel') @HttpCode(200) @Permits('learning.manage') cancel(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(learningReasonSchema)) b: { reason: string },
  ) {
    return this.learning.cancel(u, id, b.reason);
  }
  @Get('people/:id') person(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.personRecord(u, id);
  }
  @Get('certificates/:id') certificate(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.learning.certificate(u, id);
  }
  @Get('certificates/:id/file') async file(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(learningLanguageSchema)) q: { language: 'en' | 'bn' },
  ) {
    const f = await this.learning.certificateFile(u, id, q.language);
    return fileResponse(f.bytes, { ...f, download: true });
  }
  @Post('certificates/:id/revoke') @HttpCode(204) @Permits('learning.manage') revoke(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(learningReasonSchema)) b: { reason: string },
  ) {
    return this.learning.revoke(u, id, b.reason);
  }
  @Get('drills') @Permits('learning.manage') drills(@CurrentUser() u: AuthUser) {
    return this.learning.drills(u);
  }
  @Post('drills') @Permits('learning.manage') @ApiBody(openApiBody(fireDrillSchema)) createDrill(
    @CurrentUser() u: AuthUser,
    @Body(zod(fireDrillSchema)) b: FireDrillInput,
  ) {
    return this.learning.createDrill(u, b);
  }
  @Post('drills/:id/void') @HttpCode(204) @Permits('learning.manage') voidDrill(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(learningReasonSchema)) b: { reason: string },
  ) {
    return this.learning.voidDrill(u, id, b.reason);
  }
}
