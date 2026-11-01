import { Injectable } from '@nestjs/common';
import { performanceSettings } from '@gp/db';
import type { PerformanceSettingsInput, PerformanceSettingsView } from '@gp/shared';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { settingsOf } from './views.js';

/** The competencies reviews rate and the ratings guide; the defaults until first saved. */
@Injectable()
export class PerformanceSettingsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  get(): Promise<PerformanceSettingsView> {
    return this.tenantDb.run(settingsOf);
  }

  save(user: AuthUser, input: PerformanceSettingsInput): Promise<PerformanceSettingsView> {
    return this.tenantDb.run(async (tx) => {
      const before = await settingsOf(tx);
      const values = {
        competencies: input.competencies,
        ratingGuide: input.ratingGuide,
        updatedAt: new Date(),
      };
      await tx
        .insert(performanceSettings)
        .values({ tenantId: currentTenantId(), ...values })
        .onConflictDoUpdate({ target: performanceSettings.tenantId, set: values });
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'performance.settings',
        entityType: 'performance_settings',
        entityId: null,
        before: { competencies: before.competencies, ratingGuide: before.ratingGuide },
        after: { competencies: input.competencies, ratingGuide: input.ratingGuide },
      });
      return settingsOf(tx);
    });
  }
}
