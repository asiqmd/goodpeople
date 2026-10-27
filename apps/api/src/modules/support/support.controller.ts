import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  SUPPORT_ATTACHMENTS_PER_MESSAGE,
  createTicketSchema,
  isStaffRole,
  supportReplySchema,
  ticketListQuerySchema,
  ticketReplySchema,
  updateTicketSchema,
  type CreateTicketInput,
  type SupportReplyInput,
  type SupportTicketDetail,
  type SupportTicketSummary,
  type TenantWithAccess,
  type TicketListQuery,
  type TicketReplyInput,
  type UpdateTicketInput,
} from '@gp/shared';
import { z } from 'zod';
import {
  CurrentTenant,
  CurrentUser,
  type AuthedRequest,
  type PlatformUser,
} from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { userCan } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { fileResponse } from '../documents/documents.controller.js';
import { AccessStateGuard, WritableWhenReadOnly } from '../entitlements/guards.js';
import { PlatformGuard, PlatformRolesOnly } from '../platform-admin/platform.guard.js';
import { ATTACHMENT_UPLOAD, AttachmentLimits } from './attachment-limits.js';
import { SupportService, type TenantLogin } from './support.service.js';

type Files = Express.Multer.File[] | undefined;

const files = () =>
  UseInterceptors(
    AttachmentLimits,
    FilesInterceptor('files', SUPPORT_ATTACHMENTS_PER_MESSAGE, ATTACHMENT_UPLOAD),
  );

const download = (file: { bytes: Buffer; fileName: string; contentType: string }) =>
  fileResponse(file.bytes, { ...file, download: true });

const listScopeSchema = z.object({ scope: z.enum(['mine', 'all']).default('mine') });

/** A multipart form sends `internal` as text. */
const supportReplyForm = z.preprocess(
  (body) =>
    body && typeof body === 'object' && 'internal' in body && typeof body.internal === 'string'
      ? { ...body, internal: body.internal === 'true' }
      : body,
  supportReplySchema,
);

/**
 * Workspace staff contact Good People; employees go to their own HR, and a support session
 * (the `support` role, which is us) has nobody to write to.
 */
@Injectable()
export class SupportRequesterGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (user?.kind !== 'tenant' || !isStaffRole(user.role) || user.role === 'support') {
      throw forbidden('role_not_allowed', 'Only workspace staff can contact support');
    }
    return true;
  }
}

/**
 * A workspace's support tickets. Every write stays open while the workspace is read-only:
 * a workspace that cannot change anything must still be able to reach us.
 */
@ApiTags('support')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, SupportRequesterGuard)
@Controller('tenant/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  list(
    @CurrentUser() user: TenantLogin,
    @Query(zod(listScopeSchema)) query: z.infer<typeof listScopeSchema>,
  ): Promise<SupportTicketSummary[]> {
    if (query.scope === 'all' && !userCan(user, 'support.manage')) {
      throw forbidden('role_not_allowed', 'Your role sees only the tickets you opened');
    }
    return this.support.list(user, query.scope);
  }

  /** The first message is the description; files go in `files`. */
  @Post('tickets')
  @WritableWhenReadOnly()
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody(openApiBody(createTicketSchema))
  @files()
  open(
    @CurrentUser() user: TenantLogin,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(createTicketSchema)) body: CreateTicketInput,
    @UploadedFiles() uploads: Files,
  ): Promise<SupportTicketDetail> {
    return this.support.open(user, tenant, body, uploads);
  }

  @Get('tickets/:id')
  detail(
    @CurrentUser() user: TenantLogin,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupportTicketDetail> {
    return this.support.workspaceDetail(user, id);
  }

  @Post('tickets/:id/replies')
  @WritableWhenReadOnly()
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody(openApiBody(ticketReplySchema))
  @files()
  reply(
    @CurrentUser() user: TenantLogin,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(ticketReplySchema)) body: TicketReplyInput,
    @UploadedFiles() uploads: Files,
  ): Promise<SupportTicketDetail> {
    return this.support.customerReply(user, id, body, uploads);
  }

  @Post('tickets/:id/solved')
  @HttpCode(200)
  @WritableWhenReadOnly()
  solved(
    @CurrentUser() user: TenantLogin,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupportTicketDetail> {
    return this.support.solve(user, id);
  }

  @Get('attachments/:id')
  async attachment(
    @CurrentUser() user: TenantLogin,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return download(await this.support.workspaceAttachment(user, id));
  }
}

/** The support queue in the platform console, for support and operations staff. */
@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformGuard)
@PlatformRolesOnly('support', 'platform_ops')
@Controller('platform/support')
export class PlatformSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  queue(
    @CurrentUser() actor: PlatformUser,
    @Query(zod(ticketListQuerySchema)) query: TicketListQuery,
  ): Promise<SupportTicketSummary[]> {
    return this.support.queue(actor, query);
  }

  @Get('tickets/:id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<SupportTicketDetail> {
    return this.support.supportDetail(id);
  }

  @Patch('tickets/:id')
  @ApiBody(openApiBody(updateTicketSchema))
  update(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(updateTicketSchema)) body: UpdateTicketInput,
  ): Promise<SupportTicketDetail> {
    return this.support.update(actor, id, body);
  }

  /** A reply the workspace sees, or with `internal` a note it never does. */
  @Post('tickets/:id/replies')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody(openApiBody(supportReplySchema))
  @files()
  reply(
    @CurrentUser() actor: PlatformUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(supportReplyForm)) body: SupportReplyInput,
    @UploadedFiles() uploads: Files,
  ): Promise<SupportTicketDetail> {
    return this.support.supportReply(actor, id, body, uploads);
  }

  @Get('attachments/:id')
  async attachment(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return download(await this.support.supportAttachment(id));
  }
}
