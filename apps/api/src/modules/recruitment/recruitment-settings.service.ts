import { Injectable } from '@nestjs/common';
import { recruitmentSettings, type Tx } from '@gp/db';
import {
  DEFAULT_CANDIDATE_RETENTION_MONTHS,
  type RecruitmentSettingsInput,
  type RecruitmentSettingsView,
} from '@gp/shared';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';

type SettingsRow = typeof recruitmentSettings.$inferSelect;

const toView = (row: SettingsRow | undefined): RecruitmentSettingsView => ({
  careersEnabled: row?.careersEnabled ?? false,
  introEn: row?.introEn ?? null,
  introBn: row?.introBn ?? null,
  retentionMonths: row?.retentionMonths ?? DEFAULT_CANDIDATE_RETENTION_MONTHS,
  privacyEmail: row?.privacyEmail ?? null,
  updatedAt: row?.updatedAt.toISOString() ?? null,
});

/** The workspace's settings, or the defaults (careers page off) before they are first saved. */
export async function settingsOf(tx: Tx): Promise<RecruitmentSettingsView> {
  const [row] = await tx.select().from(recruitmentSettings);
  return toView(row);
}

/** The careers page and how long candidates' data is kept. */
@Injectable()
export class RecruitmentSettingsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  get(): Promise<RecruitmentSettingsView> {
    return this.tenantDb.run(settingsOf);
  }

  /** The row is created on the first save. */
  save(user: AuthUser, input: RecruitmentSettingsInput): Promise<RecruitmentSettingsView> {
    return this.tenantDb.run(async (tx) => {
      const before = await settingsOf(tx);
      const values = {
        careersEnabled: input.careersEnabled,
        introEn: input.introEn ?? null,
        introBn: input.introBn ?? null,
        retentionMonths: input.retentionMonths,
        privacyEmail: input.privacyEmail?.toLowerCase() ?? null,
        updatedAt: new Date(),
      };
      const [row] = await tx
        .insert(recruitmentSettings)
        .values({ tenantId: currentTenantId(), ...values })
        .onConflictDoUpdate({ target: recruitmentSettings.tenantId, set: values })
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'recruitment.settings',
        entityType: 'recruitment_settings',
        entityId: null,
        before: { ...before, updatedAt: undefined },
        after: { ...values, updatedAt: undefined },
      });
      return toView(row);
    });
  }
}
