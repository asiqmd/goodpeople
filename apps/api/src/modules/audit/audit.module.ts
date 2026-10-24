import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { TenantAuditService } from './tenant-audit.service.js';

@Module({
  providers: [AuditService, TenantAuditService],
  exports: [AuditService, TenantAuditService],
})
export class AuditModule {}
