import type { CheckResult, CommitteeCheckView, Ref, RuleRefView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { day } from '../leave/leave-views';
import { Badge, type Tone } from '../ui';

export const RESULT_TONE: Record<CheckResult, Tone> = {
  ok: 'green',
  fail: 'red',
  unknown: 'amber',
};

/** A company, or a site with the company it belongs to. */
export async function EstablishmentName({
  of,
}: {
  of: { legalEntity: Ref; location: Ref | null };
}) {
  const t = await getTranslations('relations.committees');
  return of.location
    ? t('site', { site: of.location.name, company: of.legalEntity.name })
    : of.legalEntity.name;
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </Link>
  );
}

/** Compliance, committees and unions: the area's own links. */
export async function RelationsNav({ current }: { current: 'committees' | 'unions' }) {
  const t = await getTranslations('relations.nav');
  return (
    <nav className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      <NavLink href="/workspace/compliance" active={false}>
        {t('compliance')}
      </NavLink>
      <NavLink href="/workspace/compliance/committees" active={current === 'committees'}>
        {t('committees')}
      </NavLink>
      <NavLink href="/workspace/compliance/unions" active={current === 'unions'}>
        {t('unions')}
      </NavLink>
    </nav>
  );
}

/** The Act and section a rule comes from, and whether counsel has still to confirm it. */
export async function RuleRef({ rule }: { rule: RuleRefView | null }) {
  if (!rule) return null;
  const t = await getTranslations('relations');
  return (
    <span className="text-xs text-slate-500">
      {t('rule', { act: rule.reference.act, section: rule.reference.section })}
      {rule.status === 'needs_review' && ` · ${t('needsReview')}`}
    </span>
  );
}

/** Each check with its result and what was found against what the law asks. */
export async function CheckList({ checks }: { checks: CommitteeCheckView[] }) {
  const t = await getTranslations('relations');
  const format = await getFormatter();
  const message = (c: CommitteeCheckView) => {
    const date = c.date ? day(format, c.date) : '';
    const counts = { value: c.value ?? 0, min: c.min ?? 0, max: c.max ?? 0 };
    switch (c.code) {
      case 'formed':
        return c.result === 'ok' ? t('checks.formed.ok', { date }) : t('checks.formed.fail');
      case 'in_term':
        if (c.result === 'fail') return t('checks.in_term.fail', { date });
        return c.date ? t('checks.in_term.ok', { date }) : t('checks.in_term.open');
      case 'size':
        return t(c.min === c.max ? 'checks.size.exact' : 'checks.size.range', counts);
      case 'balance':
        return t(c.max === null ? 'checks.balance.atLeast' : 'checks.balance.equal', counts);
      case 'women_majority':
        return t(
          c.result === 'unknown' ? 'checks.women_majority.unknown' : 'checks.women_majority.count',
          counts,
        );
      case 'meetings':
        return t(c.result === 'ok' ? 'checks.meetings.ok' : 'checks.meetings.fail', { date });
      case 'minutes':
        return t(c.result === 'ok' ? 'checks.minutes.ok' : 'checks.minutes.fail', counts);
      default:
        return t(`checks.${c.code}.${c.result}`, counts);
    }
  };
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.code} className="flex items-start gap-2 text-sm">
          <span className="shrink-0">
            <Badge tone={RESULT_TONE[c.result]}>{t(`results.${c.result}`)}</Badge>
          </span>
          <span className="text-slate-700">{message(c)}</span>
        </li>
      ))}
    </ul>
  );
}
