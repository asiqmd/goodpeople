import { bdHolidayTemplate, bdLeaveDefaults } from '@gp/country-packs';
import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import {
  attendanceSettings,
  holidayCalendars,
  holidays,
  leaveTypes,
  shifts,
} from './schema/index.js';

/**
 * Gives a workspace its country pack's starting point: the statutory leave types, a default
 * holiday calendar for this year and next, a general shift and attendance settings.
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
