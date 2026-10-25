import type {
  MaternityCaseStatus,
  MaternityCaseSummary,
  MaternityPartStatus,
  MaternityRuleRef,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { day } from '../leave/leave-views';
import { taka } from '../payroll/payroll-views';
import { Badge, type Tone } from '../ui';

const CASE_TONE: Record<MaternityCaseStatus, Tone> = {
  open: 'blue',
  closed: 'green',
  cancelled: 'slate',
};

const PART_TONE: Record<MaternityPartStatus, Tone> = {
  waiting: 'slate',
  due: 'amber',
  overdue: 'red',
  paid: 'green',
  lost: 'slate',
};

export async function CaseStatusBadge({ status }: { status: MaternityCaseStatus }) {
  const t = await getTranslations('maternity.status');
  return <Badge tone={CASE_TONE[status]}>{t(status)}</Badge>;
}

export async function PartStatusBadge({ status }: { status: MaternityPartStatus }) {
  const t = await getTranslations('maternity.partStatus');
  return <Badge tone={PART_TONE[status]}>{t(status)}</Badge>;
}

export async function EligibleBadge({ eligible }: { eligible: boolean }) {
  const t = await getTranslations('maternity');
  return (
    <Badge tone={eligible ? 'green' : 'amber'}>{eligible ? t('eligible') : t('ineligible')}</Badge>
  );
}

/**
 * The sections of the Act a figure comes from, each once: "s.46 (amended 2025)". A rule not
 * yet checked against the gazette is marked, with the reason on hover.
 */
export async function Cite({ rules }: { rules: MaternityRuleRef[] }) {
  const t = await getTranslations('maternity.cite');
  const seen = new Map<string, MaternityRuleRef>();
  for (const rule of rules) {
    const amended = rule.reference.act.includes('Amendment');
    const key = `${rule.reference.section}|${amended}`;
    if (!seen.has(key) || rule.status === 'needs_review') seen.set(key, rule);
  }
  return (
    <span className="text-xs text-slate-500">
      (
      {[...seen.values()].map((rule, i) => (
        <span key={`${rule.key}-${i}`}>
          {i > 0 && ', '}
          {rule.reference.act.includes('Amendment')
            ? t('amended', { section: rule.reference.section })
            : t('section', { section: rule.reference.section })}
          {rule.status === 'needs_review' && (
            <abbr title={t('review')} className="no-underline">
              *
            </abbr>
          )}
        </span>
      ))}
      )
    </span>
  );
}

/** "Part 1: ৳24,457 by 14 Sept 2026", or what it waits for. */
export async function NextPart({ next }: { next: MaternityCaseSummary['next'] }) {
  const t = await getTranslations('maternity');
  const format = await getFormatter();
  if (!next) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {next.dueOn
          ? t('nextDue', {
              part: next.part,
              amount: taka(format, next.amount),
              date: day(format, next.dueOn),
            })
          : t('nextWaiting', { part: next.part })}
      </span>
      {next.status === 'overdue' && <PartStatusBadge status="overdue" />}
    </span>
  );
}
