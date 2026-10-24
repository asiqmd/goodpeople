import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import {
  deviceSchema,
  mfaConfirmSchema,
  mfaDisableSchema,
  passwordChangeSchema,
  preferencesSchema,
  type AccountView,
  type DeviceInput,
  type MfaConfirmInput,
  type MfaDisableInput,
  type MfaEnabled,
  type MfaSetup,
  type PasswordChangeInput,
  type PreferencesInput,
} from '@gp/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth-user.js';
import { openApiBody, zod } from '../../common/zod.js';
import { AccountService } from './account.service.js';

const removeDeviceSchema = z.object({ token: z.string().min(10).max(4096) });

/** The signed-in login's own settings; workspace and platform logins alike. */
@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  view(@CurrentUser() user: AuthUser): Promise<AccountView> {
    return this.account.view(user);
  }

  @Post('password')
  @HttpCode(204)
  @ApiBody(openApiBody(passwordChangeSchema))
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(zod(passwordChangeSchema)) body: PasswordChangeInput,
  ): Promise<void> {
    return this.account.changePassword(user, body);
  }

  /** A new authenticator secret; nothing changes until a code from it is confirmed. */
  @Post('mfa/setup')
  @HttpCode(200)
  startMfa(@CurrentUser() user: AuthUser): Promise<MfaSetup> {
    return this.account.startMfa(user);
  }

  @Post('mfa/confirm')
  @HttpCode(200)
  @ApiBody(openApiBody(mfaConfirmSchema))
  confirmMfa(
    @CurrentUser() user: AuthUser,
    @Body(zod(mfaConfirmSchema)) body: MfaConfirmInput,
  ): Promise<MfaEnabled> {
    return this.account.confirmMfa(user, body.code);
  }

  @Post('mfa/disable')
  @HttpCode(204)
  @ApiBody(openApiBody(mfaDisableSchema))
  disableMfa(
    @CurrentUser() user: AuthUser,
    @Body(zod(mfaDisableSchema)) body: MfaDisableInput,
  ): Promise<void> {
    return this.account.disableMfa(user, body.password);
  }

  @Patch('preferences')
  @ApiBody(openApiBody(preferencesSchema))
  preferences(
    @CurrentUser() user: AuthUser,
    @Body(zod(preferencesSchema)) body: PreferencesInput,
  ): Promise<AccountView> {
    return this.account.updatePreferences(user, body);
  }

  /** The mobile app registers its push token after signing in. */
  @Post('devices')
  @HttpCode(204)
  @ApiBody(openApiBody(deviceSchema))
  addDevice(
    @CurrentUser() user: AuthUser,
    @Body(zod(deviceSchema)) body: DeviceInput,
  ): Promise<void> {
    return this.account.addDevice(user, body);
  }

  @Post('devices/remove')
  @HttpCode(204)
  @ApiBody(openApiBody(removeDeviceSchema))
  removeDevice(
    @CurrentUser() user: AuthUser,
    @Body(zod(removeDeviceSchema)) body: z.infer<typeof removeDeviceSchema>,
  ): Promise<void> {
    return this.account.removeDevice(user, body.token);
  }
}
