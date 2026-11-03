import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { OidcAccountController, OidcController, OidcTestController } from './oidc.controller.js';
import { OidcService } from './oidc.service.js';
import { ScimController } from './scim.controller.js';
import { ScimService } from './scim.service.js';
@Module({
  imports: [AuthModule, EntitlementsModule],
  controllers: [
    IdentityController,
    OidcController,
    OidcTestController,
    OidcAccountController,
    ScimController,
  ],
  providers: [IdentityService, OidcService, ScimService],
})
export class IdentityModule {}
