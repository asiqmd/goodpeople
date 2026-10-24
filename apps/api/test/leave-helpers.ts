import { SEED_EMPLOYEE_EMAIL, SEED_MANAGER_EMAIL } from '@gp/db';
import { addDays, todayIn, weekdayOf } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { api, bearer, tenantLogin, testEnv } from './test-env.js';

/** Next year, so requests are always in the future and inside one leave year. */
export const NEXT_YEAR = Number(todayIn().slice(0, 4)) + 1;

/** The first date on or after `from` that falls on `weekday` (0 = Sunday … 6 = Saturday). */
export function onOrAfter(from: string, weekday: number): string {
  let d = from;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}

export async function loginAs(app: INestApplication, email: string) {
  const res = await api(app)
    .post('/auth/login')
    .send({ tenant: 'my-group', email, password: testEnv().password })
    .expect(200);
  return res.body.accessToken as string;
}

export const rahima = (app: INestApplication) => loginAs(app, SEED_EMPLOYEE_EMAIL);
export const shirin = (app: INestApplication) => loginAs(app, SEED_MANAGER_EMAIL);
export const groupHr = async (app: INestApplication) =>
  (await tenantLogin(app, 'my-group')).accessToken;

export async function leaveTypeId(app: INestApplication, token: string, code: string) {
  const types = (await api(app).get('/tenant/leave/types').set(bearer(token)).expect(200)).body;
  return types.find((t: { code: string }) => t.code === code).id as string;
}

/**
 * A Monday-based span of `days` working days that the preview counts as exactly that many,
 * moving a week at a time past holidays. Keeps tests independent of each year's calendar.
 */
export async function workingSpan(
  app: INestApplication,
  token: string,
  typeId: string,
  from: string,
  days: number,
): Promise<{ startDate: string; endDate: string }> {
  for (let start = onOrAfter(from, 1), tries = 0; tries < 20; start = addDays(start, 7), tries++) {
    const span = { startDate: start, endDate: addDays(start, days - 1) };
    const preview = await api(app)
      .post('/tenant/me/leave/preview')
      .set(bearer(token))
      .send({ leaveTypeId: typeId, ...span })
      .expect(201);
    if (preview.body.days === days && preview.body.excluded.length === 0) return span;
  }
  throw new Error(`No clear span of ${days} working days after ${from}`);
}
