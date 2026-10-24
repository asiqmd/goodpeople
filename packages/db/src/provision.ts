import { bdHolidayTemplate, bdLeaveDefaults } from '@gp/country-packs';
import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import { holidayCalendars, holidays, leaveTypes } from './schema/index.js';

/**
 * Gives a workspace its country pack's starting point: the statutory leave types and a
 * default holiday calendar for this year and next. Idempotent; call inside a transaction
 * scoped to the tenant (runAsTenant / scopeToTenant).
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
