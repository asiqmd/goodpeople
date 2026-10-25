import { BD_RULES, ruleOn } from '@gp/country-packs';
import { addDays } from '@gp/shared';
import {
  certificateOn,
  certificateValidUntil,
  checkPerson,
  minutesInWindow,
  weekStartOf,
  type CertificateDoc,
  type CheckDay,
  type CheckPerson,
  type OvertimeCaps,
} from './checker.js';

const DHAKA = 'Asia/Dhaka';
const at = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);
const SATURDAY = '2026-10-10';

const adult: CheckPerson = {
  dateOfBirth: '1995-03-01',
  gender: 'male',
  nightWorkConsentFrom: null,
  workplace: 'factory',
  timeZone: DHAKA,
};
const woman: CheckPerson = { ...adult, gender: 'female' };
/** Sixteen through October 2026. */
const adolescent: CheckPerson = { ...adult, dateOfBirth: '2010-06-15' };
const caps: OvertimeCaps = { dailyMinutes: 120, weeklyMinutes: 720, monthlyMinutes: null };

/** A day worked from one local time to another (the next morning when `to` is earlier). */
function worked(date: string, from: string, to: string, overtimeMinutes = 0): CheckDay {
  const firstIn = at(date, from);
  const lastOut = at(to > from ? date : addDays(date, 1), to);
  const span = (lastOut.getTime() - firstIn.getTime()) / 60_000;
  return {
    date,
    firstIn,
    lastOut,
    workedMinutes: span - Math.min(60, Math.max(0, span - 300)),
    overtimeMinutes,
  };
}
const minutes = (date: string, workedMinutes: number, overtimeMinutes = 0): CheckDay => ({
  date,
  firstIn: at(date, '08:00'),
  lastOut: at(date, '08:00'),
  workedMinutes,
  overtimeMinutes,
});
const off = (date: string): CheckDay => ({
  date,
  firstIn: null,
  lastOut: null,
  workedMinutes: 0,
  overtimeMinutes: 0,
});
const days = (from: string, count: number, make: (date: string) => CheckDay) =>
  Array.from({ length: count }, (_, i) => make(addDays(from, i)));
const kinds = (findings: { kind: string }[]) => findings.map((f) => f.kind).toSorted();

describe('weekStartOf', () => {
  it('runs weeks from Saturday to Friday', () => {
    expect(weekStartOf('2026-10-10')).toBe('2026-10-10');
    expect(weekStartOf('2026-10-11')).toBe('2026-10-10');
    expect(weekStartOf('2026-10-16')).toBe('2026-10-10');
    expect(weekStartOf('2026-10-17')).toBe('2026-10-17');
  });
});

describe('minutesInWindow', () => {
  const night = { from: '22:00', to: '06:00' };
  it('counts the part of a span inside a window that runs past midnight', () => {
    expect(
      minutesInWindow(at('2026-10-12', '14:00'), at('2026-10-12', '22:30'), night, DHAKA),
    ).toBe(30);
    expect(
      minutesInWindow(at('2026-10-12', '20:00'), at('2026-10-13', '05:00'), night, DHAKA),
    ).toBe(420);
    expect(
      minutesInWindow(at('2026-10-13', '05:30'), at('2026-10-13', '14:00'), night, DHAKA),
    ).toBe(30);
    expect(
      minutesInWindow(at('2026-10-12', '06:00'), at('2026-10-12', '22:00'), night, DHAKA),
    ).toBe(0);
  });

  it('handles a window within one day, and spans over several nights', () => {
    expect(
      minutesInWindow(
        at('2026-10-12', '11:00'),
        at('2026-10-12', '15:00'),
        { from: '12:00', to: '13:00' },
        DHAKA,
      ),
    ).toBe(60);
    expect(
      minutesInWindow(at('2026-10-12', '12:00'), at('2026-10-14', '12:00'), night, DHAKA),
    ).toBe(960);
    expect(
      minutesInWindow(at('2026-10-12', '12:00'), at('2026-10-12', '12:00'), night, DHAKA),
    ).toBe(0);
  });

  it('reads the window in the workplace’s own time zone', () => {
    // 22:30 in Dhaka is 16:30 UTC: outside 22:00–06:00 in UTC.
    const start = at('2026-10-12', '14:00');
    const end = at('2026-10-12', '22:30');
    expect(minutesInWindow(start, end, night, 'UTC')).toBe(0);
  });
});

describe('checkPerson: adults', () => {
  it('flags a day over 10 hours (s.100), with the times and the section', () => {
    expect(checkPerson(adult, [minutes('2026-10-12', 600)], caps)).toEqual([]);
    const [finding, ...rest] = checkPerson(adult, [worked('2026-10-12', '08:00', '19:01')], caps);
    expect(rest).toEqual([]);
    expect(finding).toEqual({
      kind: 'daily_hours',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-12',
      value: 601,
      limit: 600,
      detail: {
        reference: ruleOn(BD_RULES, 'work.daily_max_hours_with_overtime', '2026-10-12').reference,
        rule: 'work.daily_max_hours_with_overtime',
        firstIn: '08:00',
        lastOut: '19:01',
      },
    });
    expect(finding!.detail.reference).toMatchObject({ section: '100' });
  });

  it('flags a Saturday-to-Friday week over 60 hours (s.102), not two halves of weeks', () => {
    const sixty = days(SATURDAY, 6, (d) => minutes(d, 600));
    expect(checkPerson(adult, sixty, caps)).toEqual([]);
    const over = [...sixty.slice(0, 5), minutes(addDays(SATURDAY, 5), 601)];
    const findings = checkPerson(adult, over, caps);
    expect(kinds(findings)).toEqual(['daily_hours', 'weekly_hours']);
    expect(findings.find((f) => f.kind === 'weekly_hours')).toMatchObject({
      periodStart: SATURDAY,
      periodEnd: '2026-10-16',
      value: 3601,
      limit: 3600,
      detail: { reference: { section: '102' }, daysWorked: 6 },
    });
    // Wednesday to Monday: 72 hours in six days, but 36 in each of two weeks.
    const straddling = days('2026-10-14', 6, (d) => minutes(d, 720));
    expect(kinds(checkPerson(adult, straddling, caps))).not.toContain('weekly_hours');
  });

  it('flags seven or more days in a row without a holiday (s.103) as one run', () => {
    const six = days(SATURDAY, 6, (d) => minutes(d, 480));
    expect(checkPerson(adult, [...six, off('2026-10-16')], caps)).toEqual([]);
    const nine = days(SATURDAY, 9, (d) => minutes(d, 480));
    expect(checkPerson(adult, nine, caps)).toEqual([
      {
        kind: 'no_weekly_holiday',
        periodStart: SATURDAY,
        periodEnd: '2026-10-18',
        value: 9,
        limit: 6,
        detail: {
          reference: ruleOn(BD_RULES, 'holidays.weekly.min_days', SATURDAY).reference,
          rule: 'holidays.weekly.min_days',
          daysWorked: 9,
        },
      },
    ]);
  });

  it('counts a day with a missing punch as attended, and a date with no record as a break', () => {
    const missing: CheckDay = { ...off('2026-10-13'), firstIn: at('2026-10-13', '07:55') };
    const run = days(SATURDAY, 7, (d) => (d === '2026-10-13' ? missing : minutes(d, 480)));
    expect(kinds(checkPerson(adult, run, caps))).toEqual(['no_weekly_holiday']);
    const gap = run.filter((d) => d.date !== '2026-10-13');
    expect(checkPerson(adult, gap, caps)).toEqual([]);
  });
});

describe('checkPerson: the company’s overtime caps', () => {
  it('flags a day, a week and (when set) a month above the caps, never at them', () => {
    expect(checkPerson(adult, [minutes('2026-10-12', 600, 120)], caps)).toEqual([]);
    expect(checkPerson(adult, [minutes('2026-10-12', 600, 150)], caps)).toEqual([
      {
        kind: 'overtime_daily',
        periodStart: '2026-10-12',
        periodEnd: '2026-10-12',
        value: 150,
        limit: 120,
        detail: { reference: null, rule: null, firstIn: '08:00', lastOut: '08:00' },
      },
    ]);

    const week = days(SATURDAY, 6, (d) => minutes(d, 540, 120));
    expect(checkPerson(adult, week, caps)).toEqual([]);
    const tight = { ...caps, weeklyMinutes: 600 };
    expect(checkPerson(adult, week, tight)).toMatchObject([
      { kind: 'overtime_weekly', periodStart: SATURDAY, value: 720, limit: 600 },
    ]);

    const month = [
      ...days('2026-10-03', 6, (d) => minutes(d, 540, 120)),
      ...days('2026-10-10', 6, (d) => minutes(d, 540, 120)),
    ];
    expect(kinds(checkPerson(adult, month, caps))).toEqual([]);
    expect(checkPerson(adult, month, { ...caps, monthlyMinutes: 1200 })).toMatchObject([
      {
        kind: 'overtime_monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        value: 1440,
        limit: 1200,
        detail: { reference: null, daysWorked: 12 },
      },
    ]);
  });
});

describe('checkPerson: adolescents', () => {
  it('uses the factory or other limits for a day (s.41), not the adult ones', () => {
    expect(checkPerson(adolescent, [minutes('2026-10-12', 300)], caps)).toEqual([]);
    expect(checkPerson(adolescent, [minutes('2026-10-12', 301)], caps)).toEqual([
      {
        kind: 'adolescent_daily',
        periodStart: '2026-10-12',
        periodEnd: '2026-10-12',
        value: 301,
        limit: 300,
        detail: {
          reference: ruleOn(BD_RULES, 'adolescent.daily_hours', '2026-10-12').reference,
          rule: 'adolescent.daily_hours',
          workplace: 'factory',
          age: 16,
          firstIn: '08:00',
          lastOut: '08:00',
        },
      },
    ]);
    const shop = { ...adolescent, workplace: 'other' as const };
    expect(checkPerson(shop, [minutes('2026-10-12', 420)], caps)).toEqual([]);
    expect(checkPerson(shop, [minutes('2026-10-12', 421)], caps)).toMatchObject([
      { kind: 'adolescent_daily', limit: 420 },
    ]);
    // Eleven hours would break the adult limit too, but only the adolescent one applies.
    expect(kinds(checkPerson(adolescent, [minutes('2026-10-12', 660)], caps))).toEqual([
      'adolescent_daily',
    ]);
  });

  it('flags a week over 36 hours in a factory and 48 elsewhere, overtime included', () => {
    const week = days(SATURDAY, 6, (d) => minutes(d, 360));
    expect(kinds(checkPerson(adolescent, week, caps)).filter((k) => k.endsWith('weekly'))).toEqual(
      [],
    );
    const more = [...week.slice(0, 5), minutes('2026-10-15', 361)];
    expect(checkPerson(adolescent, more, caps).find((f) => f.kind === 'adolescent_weekly')).toEqual(
      {
        kind: 'adolescent_weekly',
        periodStart: SATURDAY,
        periodEnd: '2026-10-16',
        value: 2161,
        limit: 2160,
        detail: {
          reference: ruleOn(BD_RULES, 'adolescent.weekly_max_hours_with_overtime', SATURDAY)
            .reference,
          rule: 'adolescent.weekly_max_hours_with_overtime',
          workplace: 'factory',
          age: 16,
          daysWorked: 6,
        },
      },
    );
    const shop = { ...adolescent, workplace: 'other' as const };
    const shopWeek = days(SATURDAY, 6, (d) => minutes(d, 420));
    expect(checkPerson(shop, shopWeek, caps)).toEqual([]);
  });

  it('flags any work between 7 pm and 7 am, with the minutes inside', () => {
    expect(checkPerson(adolescent, [worked('2026-10-12', '07:00', '11:00')], caps)).toEqual([]);
    expect(checkPerson(adolescent, [worked('2026-10-12', '06:30', '11:00')], caps)).toEqual([
      {
        kind: 'adolescent_night',
        periodStart: '2026-10-12',
        periodEnd: '2026-10-12',
        value: 30,
        limit: 0,
        detail: {
          reference: ruleOn(BD_RULES, 'adolescent.no_work_between', '2026-10-12').reference,
          rule: 'adolescent.no_work_between',
          age: 16,
          window: { from: '19:00', to: '07:00' },
          firstIn: '06:30',
          lastOut: '11:00',
        },
      },
    ]);
    const evening = checkPerson(adolescent, [worked('2026-10-12', '15:00', '19:20')], caps);
    expect(evening).toMatchObject([{ kind: 'adolescent_night', value: 20 }]);
  });

  it('applies the adult rules from the 18th birthday, mid-week', () => {
    const turning = { ...adult, dateOfBirth: '2008-10-13' };
    const week = days(SATURDAY, 6, (d) => minutes(d, 360));
    // 10–12 October as an adolescent: three days over five hours. From the 13th, an adult.
    const findings = checkPerson(turning, week, caps);
    expect(findings.map((f) => `${f.kind}:${f.periodStart}`)).toEqual([
      'adolescent_daily:2026-10-10',
      'adolescent_daily:2026-10-11',
      'adolescent_daily:2026-10-12',
    ]);
    expect(findings[2]!.detail.age).toBe(17);
  });
});

describe('checkPerson: women at night (s.109)', () => {
  const lateShift = worked('2026-10-12', '14:00', '22:30');

  it('flags a woman working between 10 pm and 6 am without consent in force that day', () => {
    expect(checkPerson(woman, [lateShift], caps)).toEqual([
      {
        kind: 'women_night',
        periodStart: '2026-10-12',
        periodEnd: '2026-10-12',
        value: 30,
        limit: 0,
        detail: {
          reference: ruleOn(BD_RULES, 'women.night_work_needs_consent', '2026-10-12').reference,
          rule: 'women.night_work_needs_consent',
          window: { from: '22:00', to: '06:00' },
          firstIn: '14:00',
          lastOut: '22:30',
        },
      },
    ]);
    expect(checkPerson(adult, [lateShift], caps)).toEqual([]);
  });

  it('accepts consent from that day, not consent that starts later', () => {
    const consented = { ...woman, nightWorkConsentFrom: '2026-10-12' };
    expect(checkPerson(consented, [lateShift], caps)).toEqual([]);
    const later = { ...woman, nightWorkConsentFrom: '2026-10-13' };
    expect(kinds(checkPerson(later, [lateShift], caps))).toEqual(['women_night']);
  });

  it('counts a whole night shift, and leaves adolescent girls to the stricter rule', () => {
    const night = worked('2026-10-12', '20:00', '05:00');
    expect(checkPerson(woman, [night], caps)).toMatchObject([{ kind: 'women_night', value: 420 }]);
    const girl = { ...adolescent, gender: 'female' as const };
    expect(kinds(checkPerson(girl, [night], caps))).toEqual([
      'adolescent_daily',
      'adolescent_night',
    ]);
  });

  it('cannot judge a day without both punches', () => {
    const missing: CheckDay = { ...off('2026-10-12'), firstIn: at('2026-10-12', '23:00') };
    expect(checkPerson(woman, [missing], caps)).toEqual([]);
  });
});

const doc = (over: Partial<CertificateDoc> = {}): CertificateDoc => ({
  id: 'c1',
  title: 'Certificate of fitness',
  issuedOn: null,
  expiresOn: null,
  uploadedOn: '2026-01-10',
  ...over,
});

describe('certificates of fitness (s.37)', () => {
  it('is valid to its expiry date, else for 12 months from its upload', () => {
    expect(certificateValidUntil(doc({ expiresOn: '2026-06-30' }), 12)).toBe('2026-06-30');
    expect(certificateValidUntil(doc({ issuedOn: '2025-12-01' }), 12)).toBe('2027-01-09');
    expect(certificateValidUntil(doc(), 12)).toBe('2027-01-09');
  });

  it('is missing, valid, expiring within 30 days, or expired', () => {
    expect(certificateOn([], '2026-10-25', 12)).toEqual({
      state: 'missing',
      doc: null,
      validUntil: null,
    });
    expect(certificateOn([doc()], '2026-10-25', 12)).toMatchObject({
      state: 'valid',
      validUntil: '2027-01-09',
    });
    expect(certificateOn([doc()], '2026-12-15', 12).state).toBe('expiring');
    expect(certificateOn([doc()], '2027-01-10', 12)).toMatchObject({
      state: 'expired',
      validUntil: '2027-01-09',
    });
  });

  it('takes the certificate lasting longest, and ignores one not issued yet', () => {
    const old = doc({ id: 'old', uploadedOn: '2025-01-05' });
    const renewed = doc({ id: 'new', issuedOn: '2026-01-01', uploadedOn: '2026-01-02' });
    expect(certificateOn([old, renewed], '2026-10-25', 12).doc?.id).toBe('new');
    const future = doc({ id: 'future', issuedOn: '2026-11-01', uploadedOn: '2026-10-20' });
    expect(certificateOn([future], '2026-10-25', 12).state).toBe('missing');
    expect(certificateOn([old, future], '2026-10-25', 12)).toMatchObject({
      state: 'expired',
      doc: { id: 'old' },
    });
  });
});
