import {
  BD_LETTER_TEMPLATES,
  BD_PAY_COMPONENTS,
  BD_SALARY_STRUCTURES,
  bdHolidayTemplate,
  bdLeaveDefaults,
} from '@gp/country-packs';
import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from './client.js';
import {
  attendanceSettings,
  holidayCalendars,
  holidays,
  leaveTypes,
  letterTemplates,
  payComponents,
  payGroups,
  payrollSettings,
  salaryStructures,
  shifts,
} from './schema/index.js';

/**
 * Gives a workspace its country pack's starting point: the statutory leave types, a default
 * holiday calendar for this year and next, a general shift, attendance settings and the
 * standard letters in English and Bangla.
 * Idempotent; call inside a transaction scoped to the tenant (runAsTenant / scopeToTenant).
 */
export async function provisionCountryDefaults(
  tx: Tx,
  tenantId: string,
  options: { countryPack: 'BD'; today: string },
): Promise<void> {
  await tx
    .insert(leaveTypes)
    .values(bdLeaveDefaults(options.today).map((policy) => ({ ...policy, tenantId })))
    .onConflictDoNothing();

  await tx.insert(attendanceSettings).values({ tenantId }).onConflictDoNothing();
  await tx
    .insert(letterTemplates)
    .values(BD_LETTER_TEMPLATES.map((l) => ({ ...l, tenantId })))
    .onConflictDoNothing();
  const [defaultShift] = await tx
    .select({ id: shifts.id })
    .from(shifts)
    .where(eq(shifts.isDefault, true));
  if (!defaultShift) {
    // Eight hours of work with an hour's rest, within Labour Act ss.100–101.
    await tx
      .insert(shifts)
      .values({
        tenantId,
        code: 'GEN',
        name: 'General shift',
        nameBn: 'সাধারণ শিফট',
        startTime: '09:00',
        endTime: '18:00',
        breakMinutes: 60,
        isDefault: true,
      })
      .onConflictDoNothing();
  }

  await provisionPayroll(tx, tenantId);

  const [calendar] = await tx
    .select({ id: holidayCalendars.id })
    .from(holidayCalendars)
    .where(eq(holidayCalendars.isDefault, true));
  if (calendar) return;

  const [created] = await tx
    .insert(holidayCalendars)
    .values({ tenantId, name: 'Bangladesh public holidays', isDefault: true })
    .returning({ id: holidayCalendars.id });
  const year = Number(options.today.slice(0, 4));
  await tx
    .insert(holidays)
    .values(
      [...bdHolidayTemplate(year), ...bdHolidayTemplate(year + 1)].map((h) => ({
        tenantId,
        calendarId: created!.id,
        date: h.date,
        name: h.name,
        nameBn: h.nameBn,
        kind: h.kind,
        isTentative: h.tentative,
      })),
    )
    .onConflictDoNothing();
}

/**
 * The country pack's pay components and salary structures, a monthly pay group and payroll
 * settings. Idempotent: what a workspace already has (by code) is left as it is.
 */
export async function provisionPayroll(tx: Tx, tenantId: string): Promise<void> {
  await tx
    .insert(payComponents)
    .values(BD_PAY_COMPONENTS.map((c) => ({ ...c, tenantId, isSystem: true })))
    .onConflictDoNothing();
  // Run formulas arrived after the first components (Phase 2 M2): fill in the pack's where a
  // system component has none, leaving anything a workspace set itself.
  for (const c of BD_PAY_COMPONENTS.filter((p) => p.runFormula)) {
    await tx
      .update(payComponents)
      .set({ runFormula: c.runFormula })
      .where(
        and(
          eq(payComponents.code, c.code),
          eq(payComponents.isSystem, true),
          isNull(payComponents.runFormula),
        ),
      );
  }
  await tx
    .insert(salaryStructures)
    .values(BD_SALARY_STRUCTURES.map((s) => ({ ...s, tenantId, isSystem: true })))
    .onConflictDoNothing();
  await tx
    .insert(payGroups)
    .values({ tenantId, code: 'MONTHLY', name: 'Monthly', frequency: 'monthly', isDefault: true })
    .onConflictDoNothing();
  await tx.insert(payrollSettings).values({ tenantId }).onConflictDoNothing();
}
