import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { Module } from '@nestjs/common';
import { PublicAuth, ServiceGuard } from './public-auth.js';
import { PublicDirectory } from './public.service.js';
import { IntegrationsAdmin } from './admin.service.js';
import {
  ClientTokenController,
  PublicDirectoryController,
  PublicContractController,
  IntegrationsController,
} from './integrations.controller.js';
import { WebhookWorker } from './webhook-worker.js';
@Module({
  imports: [EntitlementsModule],
  controllers: [
    ClientTokenController,
    PublicContractController,
    PublicDirectoryController,
    IntegrationsController,
  ],
  providers: [PublicAuth, ServiceGuard, PublicDirectory, IntegrationsAdmin, WebhookWorker],
  exports: [WebhookWorker],
})
export class IntegrationsModule {}
