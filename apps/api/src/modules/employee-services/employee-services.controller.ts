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
import {
  assetIssueSchema,
  assetReturnSchema,
  assetSchema,
  hrReplySchema,
  hrRequestSchema,
  hrRequestUpdateSchema,
  serviceReasonSchema,
  serviceScopeSchema,
} from '@gp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard, FeatureGuard, RequireFeature } from '../entitlements/guards.js';
import { EmployeeServicesService } from './employee-services.service.js';
const queueSchema = z.object({ scope: z.enum(['mine', 'all']).default('mine') });
@ApiTags('employee-services')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, FeatureGuard, TenantRolesGuard)
@RequireFeature('core_hr')
@Controller('tenant/employee-services')
export class EmployeeServicesController {
  constructor(private readonly service: EmployeeServicesService) {}
  @Get('me') me(@CurrentUser() u: AuthUser) {
    return this.service.me(u);
  }
  @Get('requests') requests(
    @CurrentUser() u: AuthUser,
    @Query(zod(queueSchema)) q: z.infer<typeof queueSchema>,
  ) {
    return this.service.requests(u, q.scope === 'all');
  }
  @Get('requests/:id') request(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.request(u, id);
  }
  @Post('requests')
  @ApiBody(openApiBody(hrRequestSchema))
  createRequest(
    @CurrentUser() u: AuthUser,
    @Body(zod(hrRequestSchema)) b: z.infer<typeof hrRequestSchema>,
  ) {
    return this.service.createRequest(u, b);
  }
  @Get('requests/:id/handlers')
  @Permits('employee_services.manage')
  handlers(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.handlers(u, id);
  }
  @Post('requests/:id/replies')
  @HttpCode(200)
  @ApiBody(openApiBody(hrReplySchema))
  reply(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(hrReplySchema)) b: z.infer<typeof hrReplySchema>,
  ) {
    return this.service.reply(u, id, b);
  }
  @Patch('requests/:id')
  @ApiBody(openApiBody(hrRequestUpdateSchema))
  updateRequest(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(hrRequestUpdateSchema)) b: z.infer<typeof hrRequestUpdateSchema>,
  ) {
    return this.service.updateRequest(u, id, b);
  }
  @Get('assets')
  @Permits('employee_services.manage')
  assets(
    @CurrentUser() u: AuthUser,
    @Query(zod(serviceScopeSchema)) q: z.infer<typeof serviceScopeSchema>,
  ) {
    return this.service.assets(u, q.legalEntityId);
  }
  @Get('assets/:id')
  @Permits('employee_services.manage')
  asset(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.asset(u, id);
  }
  @Post('assets')
  @Permits('employee_services.manage')
  @ApiBody(openApiBody(assetSchema))
  createAsset(@CurrentUser() u: AuthUser, @Body(zod(assetSchema)) b: z.infer<typeof assetSchema>) {
    return this.service.createAsset(u, b);
  }
  @Post('assets/:id/issue')
  @HttpCode(200)
  @Permits('employee_services.manage')
  @ApiBody(openApiBody(assetIssueSchema))
  issueAsset(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(assetIssueSchema)) b: z.infer<typeof assetIssueSchema>,
  ) {
    return this.service.issueAsset(u, id, b);
  }
  @Post('assets/:id/retire')
  @HttpCode(200)
  @Permits('employee_services.manage')
  @ApiBody(openApiBody(serviceReasonSchema))
  retireAsset(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(serviceReasonSchema)) b: { reason: string },
  ) {
    return this.service.retireAsset(u, id, b.reason);
  }
  @Get('issues/mine') mine(@CurrentUser() u: AuthUser) {
    return this.service.myIssues(u);
  }
  @Post('issues/:id/acknowledge')
  @HttpCode(200)
  acknowledge(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.acknowledgeIssue(u, id);
  }
  @Post('issues/:id/return')
  @HttpCode(200)
  @Permits('employee_services.manage')
  @ApiBody(openApiBody(assetReturnSchema))
  returnAsset(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(assetReturnSchema)) b: z.infer<typeof assetReturnSchema>,
  ) {
    return this.service.returnAsset(u, id, b);
  }
}
