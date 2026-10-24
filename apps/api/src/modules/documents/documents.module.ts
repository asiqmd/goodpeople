import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, TenantRolesGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
