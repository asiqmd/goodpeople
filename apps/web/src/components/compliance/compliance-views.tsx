import {
  HOURS_ALERT_KINDS,
  type CertificateState,
  type ComplianceAlertKind,
  type ComplianceAlertStatus,
  type ComplianceAlertView,
  type HoursLevel,
  type LegalRef,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { hm } from '@/components/attendance/attendance-views';
import { day } from '@/components/leave/leave-views';
import type { Tone } from '../ui';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

const TABS = [
  ['overview', '/workspace/compliance'],
  ['alerts', '/workspace/compliance/alerts'],
  ['hours', '/workspace/compliance/hours'],
  ['adolescents', '/workspace/compliance/adolescents'],
  ['nightWork', '/workspace/compliance/night-work'],
  ['settings', '/workspace/compliance/settings'],
] as const;
export type ComplianceTab = (typeof TABS)[number][0];

/** Groups of alert kinds as the overview shows them. */
export const KIND_GROUPS: { group: string; kinds: ComplianceAlertKind[] }[] = [
  { group: 'adults', kinds: ['daily_hours', 'weekly_hours', 'no_weekly_holiday'] },
  { group: 'caps', kinds: ['overtime_daily', 'overtime_weekly', 'overtime_monthly'] },
  {
    group: 'adolescents',
    kinds: ['adolescent_daily', 'adolescent_weekly', 'adolescent_night', 'adolescent_certificate'],
  },
  { group: 'women', kinds: ['women_night'] },
  {
    group: 'committees',
    kinds: [
      'committee_missing',
      'committee_meeting_overdue',
      'committee_minutes_late',
      'committee_term_ended',
    ],
  },
];

export const STATUS_TONE: Record<ComplianceAlertStatus, Tone> = {
  open: 'red',
  acknowledged: 'amber',
  resolved: 'green',
};

export const LEVEL_TONE: Record<HoursLevel, Tone> = { ok: 'green', warn: 'amber', over: 'red' };

export const CERTIFICATE_TONE: Record<CertificateState, Tone> = {
  valid: 'green',
  expiring: 'amber',
  expired: 'red',
  missing: 'red',
};

/** Sub-navigation across the compliance pages. */
export async function ComplianceTabs({ active }: { active: ComplianceTab }) {
  const t = await getTranslations('compliance.tabs');
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map(([tab, href]) => (
        <Link
          key={tab}
          href={href}
          aria-current={tab === active ? 'page' : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
            tab === active
              ? 'border-brand-600 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}

/** The section of the act a limit comes from, e.g. "s.100". */
export async function Section({ reference }: { reference: LegalRef | null | undefined }) {
  const t = await getTranslations('compliance');
  const format = await getFormatter();
  if (!reference) return null;
  return (
    <span className="whitespace-nowrap text-xs text-slate-500" title={reference.act}>
      {t('section', { ref: sectionDigits(format, reference.section) })}
    </span>
  );
}

/** "90A" in the reader's digits: a section is not a number, but its digits are. */
export const sectionDigits = (
  format: { number: (n: number, o?: object) => string },
  section: string,
) => section.replace(/\d+/g, (d) => format.number(Number(d), { useGrouping: false }));

const isLegalRef = (value: unknown): value is LegalRef =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as LegalRef).section === 'string' &&
  typeof (value as LegalRef).act === 'string';

/** The legal reference an alert carries, whichever job wrote it. */
export function referenceOf(alert: ComplianceAlertView): LegalRef | null {
  const reference = alert.detail?.reference;
  return isLegalRef(reference) ? reference : null;
}

const isHours = (kind: ComplianceAlertKind) =>
  (HOURS_ALERT_KINDS as readonly string[]).includes(kind);

/** What was reached against the limit, in hours or days as the kind measures them. */
export async function AlertMeasure({ alert }: { alert: ComplianceAlertView }) {
  const t = await getTranslations('compliance.alerts');
  const format = await getFormatter();
  const n = (v: number) => format.number(v);
  if (alert.kind === 'adolescent_night' || alert.kind === 'women_night') {
    return <>{t('atNight', { hours: hm(format, alert.value) })}</>;
  }
  if (isHours(alert.kind)) {
    return <>{t('ofLimit', { value: hm(format, alert.value), limit: hm(format, alert.limit) })}</>;
  }
  if (alert.kind === 'no_weekly_holiday') {
    return <>{t('daysInRow', { days: alert.value, limit: alert.limit })}</>;
  }
  if (alert.kind === 'adolescent_certificate') {
    return <>{t('daysWithout', { days: alert.value })}</>;
  }
  return <>{t('ofLimit', { value: n(alert.value), limit: n(alert.limit) })}</>;
}

/** A period: one day, or from–to. */
export const period = (format: Formatter, from: string, to: string) =>
  from === to ? day(format, from) : `${day(format, from)} – ${day(format, to)}`;

/** "19:00" in the reader's digits. */
export function clockOf(format: Formatter, time: string) {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const two = (v: number) => format.number(v, { minimumIntegerDigits: 2 });
  return `${two(h)}:${two(m)}`;
}
