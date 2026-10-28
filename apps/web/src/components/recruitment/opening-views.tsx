import {
  APPLICATION_STAGES,
  type ApprovalStepView,
  type EmployeeRef,
  type JobOpeningApprovalItem,
  type Money,
  type OpeningStageCounts,
  type OpeningStatus,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { taka } from '../payroll/payroll-views';
import { Badge, type Tone } from '../ui';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

const STATUS_TONE: Record<OpeningStatus, Tone> = {
  draft: 'slate',
  pending_approval: 'amber',
  approved: 'blue',
  rejected: 'red',
  open: 'green',
  closed: 'slate',
  filled: 'violet',
  cancelled: 'slate',
};

export async function OpeningStatusBadge({ status }: { status: OpeningStatus }) {
  const t = await getTranslations('openings.status');
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>;
}

/** The job post's title in the reader's language, falling back to the other one. */
export const postTitle = (
  o: { postTitleEn: string | null; postTitleBn: string | null },
  locale: string,
) => (locale === 'bn' ? (o.postTitleBn ?? o.postTitleEn) : (o.postTitleEn ?? o.postTitleBn));

export const personName = (p: EmployeeRef, locale: string) =>
  locale === 'bn' && p.fullNameBn ? p.fullNameBn : p.fullName;

/** A monthly gross range, or one end of it; null when there is no budget. */
export function payRange(format: Formatter, min: Money | null, max: Money | null) {
  if (min && max) return `${taka(format, min)} – ${taka(format, max)}`;
  if (min || max) return taka(format, (min ?? max)!);
  return null;
}

/** Applications by stage; each number links to the opening's pipeline. */
export async function StageCounts({ counts, href }: { counts: OpeningStageCounts; href?: string }) {
  const t = await getTranslations('openings.stages');
  const format = await getFormatter();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {APPLICATION_STAGES.map((stage) => {
        const label = (
          <>
            <span className="font-semibold text-slate-800 tabular-nums">
              {format.number(counts[stage])}
            </span>{' '}
            {t(stage)}
          </>
        );
        return (
          <li key={stage}>
            {href ? (
              <Link href={href} className="hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Every round of approval, oldest first: who decides each step and how it went. */
export async function ApprovalTrail({ steps }: { steps: ApprovalStepView[] }) {
  const t = await getTranslations('openings.approval');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  if (steps.length === 0) return <p className="text-sm text-slate-500">{t('none')}</p>;
  return (
    <ol className="space-y-2 text-sm">
      {steps.map((s) => (
        <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-slate-800">
            {tl(`step.${s.kind}`)}
            {s.approver && ` (${s.approver.fullName})`}
          </span>
          <span className="text-slate-600">{tl(`step.${s.status}`)}</span>
          {s.decidedBy && s.decidedAt && (
            <span className="text-xs text-slate-500">
              {t('decided', {
                name: s.decidedBy,
                date: format.dateTime(new Date(s.decidedAt), {
                  dateStyle: 'medium',
                  timeZone: 'Asia/Dhaka',
                }),
              })}
            </span>
          )}
          {s.comment && <span className="w-full text-slate-600">“{s.comment}”</span>}
        </li>
      ))}
    </ol>
  );
}

/** An opening waiting in the approvals inbox. */
export async function OpeningApprovalCard({
  item: { kind, opening: o },
}: {
  item: JobOpeningApprovalItem;
}) {
  const t = await getTranslations('openings');
  const th = await getTranslations('hr.employmentTypes');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  const locale = await getLocale();
  const budget = payRange(format, o.budgetMin, o.budgetMax);
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium text-slate-900">
        <Link
          href={`/workspace/recruitment/openings/${o.id}`}
          className="text-brand-700 hover:underline"
        >
          {o.title}
        </Link>
      </p>
      <p className="text-sm text-slate-700">
        {[o.legalEntity.name, o.orgUnit?.name, o.location?.name, o.designation?.name]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <p className="text-sm text-slate-700">
        {t('approval.summary', { count: o.headcount, type: th(o.employmentType) })}
        {budget && ` · ${t('approval.budget', { budget })}`}
      </p>
      {o.reason === 'replacement' && o.replaces && (
        <p className="text-sm text-slate-600">
          {t('approval.replaces', { name: personName(o.replaces, locale) })}
        </p>
      )}
      {o.hiringManager && (
        <p className="text-sm text-slate-600">
          {t('approval.hiringManager', { name: personName(o.hiringManager, locale) })}
        </p>
      )}
      {o.justification && <p className="text-sm text-slate-600">{o.justification}</p>}
      <div className="flex gap-2">
        <Badge tone="violet">{t('approval.badge')}</Badge>
        <Badge tone="blue">{tl(`step.${kind}`)}</Badge>
      </div>
    </div>
  );
}
