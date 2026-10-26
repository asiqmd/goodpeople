import {
  Body,
  Controller,
  Delete,
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
  allocationEndSchema,
  allocationListQuerySchema,
  allocationSchema,
  donorReportQuerySchema,
  donorSchema,
  donorUpdateSchema,
  projectPeriodQuerySchema,
  projectSchema,
  projectUpdateSchema,
  type AllocationEndInput,
  type AllocationInput,
  type AllocationListQuery,
  type AllocationView,
  type DonorInput,
  type DonorReportQuery,
  type DonorUpdateInput,
  type DonorView,
  type ProjectCostReport,
  type ProjectInput,
  type ProjectListItem,
  type ProjectPeriodQuery,
  type ProjectTimesheetRef,
  type ProjectUpdateInput,
  type ProjectView,
} from '@gp/shared';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { AllocationsService } from './allocations.service.js';
import { ProjectCostsService } from './project-costs.service.js';
import { ProjectsService } from './projects.service.js';

/** Donors, projects, the split of salaries across them, and what each project was charged. */
@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('projects')
@Permits('projects.manage')
@Controller('tenant')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly allocations: AllocationsService,
    private readonly costs: ProjectCostsService,
  ) {}

  @Get('donors')
  listDonors(): Promise<DonorView[]> {
    return this.projects.listDonors();
  }

  @Post('donors')
  @ApiBody(openApiBody(donorSchema))
  createDonor(
    @CurrentUser() user: AuthUser,
    @Body(zod(donorSchema)) body: DonorInput,
  ): Promise<DonorView> {
    return this.projects.createDonor(user, body);
  }

  @Patch('donors/:id')
  @ApiBody(openApiBody(donorUpdateSchema))
  updateDonor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(donorUpdateSchema)) body: DonorUpdateInput,
  ): Promise<DonorView> {
    return this.projects.updateDonor(user, id, body);
  }

  @Get('projects')
  list(): Promise<ProjectListItem[]> {
    return this.projects.list();
  }

  @Post('projects')
  @ApiBody(openApiBody(projectSchema))
  create(
    @CurrentUser() user: AuthUser,
    @Body(zod(projectSchema)) body: ProjectInput,
  ): Promise<ProjectView> {
    return this.projects.create(user, body);
  }

  @Get('projects/:id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProjectView> {
    return this.projects.get(id);
  }

  @Patch('projects/:id')
  @ApiBody(openApiBody(projectUpdateSchema))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(projectUpdateSchema)) body: ProjectUpdateInput,
  ): Promise<ProjectView> {
    return this.projects.update(user, id, body);
  }

  @Post('projects/:id/close')
  @HttpCode(200)
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectView> {
    return this.projects.close(user, id);
  }

  @Get('projects/:id/allocations')
  projectAllocations(@Param('id', ParseUUIDPipe) id: string): Promise<AllocationView[]> {
    return this.allocations.forProject(id);
  }

  @Post('projects/:id/allocations')
  @ApiBody(openApiBody(allocationSchema))
  allocate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(allocationSchema)) body: AllocationInput,
  ): Promise<AllocationView> {
    return this.allocations.add(user, id, body);
  }

  /** A person's shares of salary across projects. */
  @Get('allocations')
  employeeAllocations(
    @Query(zod(allocationListQuerySchema)) query: AllocationListQuery,
  ): Promise<AllocationView[]> {
    return this.allocations.forEmployee(query.employeeId);
  }

  @Post('allocations/:id/end')
  @HttpCode(200)
  @ApiBody(openApiBody(allocationEndSchema))
  endAllocation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(allocationEndSchema)) body: AllocationEndInput,
  ): Promise<AllocationView> {
    return this.allocations.end(user, id, body);
  }

  @Delete('allocations/:id')
  @HttpCode(204)
  removeAllocation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.allocations.remove(user, id);
  }

  /** Salaries charged by month, against the staff budget and the cap on administration. */
  @Get('projects/:id/costs')
  costReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(projectPeriodQuerySchema)) query: ProjectPeriodQuery,
  ): Promise<ProjectCostReport> {
    return this.costs.report(id, query);
  }

  @Get('projects/:id/timesheets')
  timesheets(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(projectPeriodQuerySchema)) query: ProjectPeriodQuery,
  ): Promise<ProjectTimesheetRef[]> {
    return this.costs.timesheets(id, query);
  }

  /** The personnel cost schedule for the donor, as CSV or a PDF in English or Bangla. */
  @Get('projects/:id/donor-report')
  async donorReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zod(donorReportQuerySchema)) query: DonorReportQuery,
  ): Promise<StreamableFile> {
    const file = await this.costs.donorReport(id, query);
    return fileResponse(file.bytes, {
      contentType: file.contentType,
      fileName: file.fileName,
      download: true,
    });
  }
}
