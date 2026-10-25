import { Module } from '@nestjs/common';
import { TenantRolesGuard } from '../../common/roles.js';
import { AuditModule } from '../audit/audit.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { LettersController } from './letters.controller.js';
import { LettersService } from './letters.service.js';
import { PdfService } from './pdf.service.js';

@Module({
  imports: [AuditModule, EntitlementsModule, DocumentsModule],
  controllers: [LettersController],
  providers: [LettersService, PdfService, TenantRolesGuard],
  exports: [PdfService],
})
export class LettersModule {}
