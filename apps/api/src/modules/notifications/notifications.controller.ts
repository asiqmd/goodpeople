import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  NOTIFICATION_EVENTS,
  USER_LANGUAGES,
  deliveryListQuerySchema,
  notificationListQuerySchema,
  notificationSettingsSchema,
  notificationTemplateSchema,
  type DeliveryView,
  type NotificationEvent,
  type NotificationInbox,
  type NotificationSettingsInput,
  type NotificationSettingsView,
  type NotificationTemplateInput,
  type NotificationTemplateView,
  type TenantWithAccess,
  type UserLanguage,
} from '@gp/shared';
import type { z } from 'zod';
import { CurrentTenant, CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { Permits, TenantRolesGuard } from '../../common/roles.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccessStateGuard } from '../entitlements/guards.js';
import { NotificationAdminService } from './notification-admin.service.js';
import { NotificationsService } from './notifications.service.js';

const eventPipe = new ParseEnumPipe(Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e, e])));
const languagePipe = new ParseEnumPipe(Object.fromEntries(USER_LANGUAGES.map((l) => [l, l])));

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AccessStateGuard, TenantRolesGuard)
@Controller('tenant')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly admin: NotificationAdminService,
  ) {}

  /** The signed-in person's inbox: the latest 50 and how many are unread. */
  @Get('notifications')
  inbox(
    @CurrentUser() user: AuthUser,
    @Query(zod(notificationListQuerySchema)) query: z.infer<typeof notificationListQuerySchema>,
  ): Promise<NotificationInbox> {
    return this.notifications.inbox(user, query.unread === 'true');
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.notifications.markRead(user, id);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  markAllRead(@CurrentUser() user: AuthUser): Promise<void> {
    return this.notifications.markAllRead(user);
  }

  @Get('notification-settings')
  @Permits('notifications.manage')
  settings(@CurrentTenant() tenant: TenantWithAccess): Promise<NotificationSettingsView> {
    return this.admin.settings(tenant);
  }

  @Patch('notification-settings')
  @Permits('notifications.manage')
  @ApiBody(openApiBody(notificationSettingsSchema))
  updateSettings(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantWithAccess,
    @Body(zod(notificationSettingsSchema)) body: NotificationSettingsInput,
  ): Promise<NotificationSettingsView> {
    return this.admin.updateSettings(user, tenant, body);
  }

  @Get('notification-templates')
  @Permits('notifications.manage')
  templates(): Promise<NotificationTemplateView[]> {
    return this.admin.templates();
  }

  @Put('notification-templates/:event/:language')
  @Permits('notifications.manage')
  @ApiBody(openApiBody(notificationTemplateSchema))
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('event', eventPipe) event: NotificationEvent,
    @Param('language', languagePipe) language: UserLanguage,
    @Body(zod(notificationTemplateSchema)) body: NotificationTemplateInput,
  ): Promise<NotificationTemplateView> {
    return this.admin.updateTemplate(user, event, language, body);
  }

  /** Back to the built-in wording. */
  @Delete('notification-templates/:event/:language')
  @Permits('notifications.manage')
  @HttpCode(204)
  resetTemplate(
    @CurrentUser() user: AuthUser,
    @Param('event', eventPipe) event: NotificationEvent,
    @Param('language', languagePipe) language: UserLanguage,
  ): Promise<void> {
    return this.admin.resetTemplate(user, event, language);
  }

  /** What was sent, newest first, with addresses masked. */
  @Get('notification-deliveries')
  @Permits('notifications.manage')
  deliveries(
    @Query(zod(deliveryListQuerySchema)) query: z.infer<typeof deliveryListQuerySchema>,
  ): Promise<DeliveryView[]> {
    return this.admin.deliveries(query.status);
  }

  @Post('notification-deliveries/:id/retry')
  @Permits('notifications.manage')
  retry(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeliveryView> {
    return this.admin.retry(user, id);
  }
}
