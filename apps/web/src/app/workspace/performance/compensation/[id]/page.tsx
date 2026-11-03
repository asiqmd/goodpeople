import type { CompensationRoundView, OrgSnapshot } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BudgetsForm, ProposalForm, RoundActions } from '@/components/compensation/forms';
import { day } from '@/components/leave/leave-views';
import { personName } from '@/components/recruitment/opening-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

export default async function CompensationRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('compensation');
  const f = await getFormatter();
  const locale = await getLocale();
  const result = await authedFetch<CompensationRoundView>('tenant', `/tenant/compensation/${id}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return <Banner tone="red">{result.error.message}</Banner>;
  }
  const r = result.data;
  const org =
    r.manage && r.status === 'open' ? await load<OrgSnapshot>('tenant', '/tenant/org') : null;
  const taka = (s: string) =>
    f.number(Number(s), { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 });
  return (
    <>
      <div>
        <Link href="/workspace/performance/compensation" className="text-sm text-slate-500">
          ← {t('title')}
        </Link>
        <h1 className="text-2xl font-semibold">{r.name}</h1>
        <p className="text-sm text-slate-600">
          {r.company.name} · {day(f, r.effectiveFrom)} · {t(`statuses.${r.status}`)} ·{' '}
          {t('progress', { submitted: f.number(r.submitted), people: f.number(r.people) })}
        </p>
      </div>
      {r.rmgAnnual && <Banner tone="amber">{t('rmgHint')}</Banner>}
      <Card title={t('monthlyIncrease')}>
        <p className="text-2xl font-semibold">{taka(r.monthlyIncrease)}</p>
        <p className="text-xs text-slate-500">{t('monthlyHint')}</p>
        {r.budgets.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr>
                <th className="py-2 text-start">{t('budget')}</th>
                <th className="text-end">{t('limit')}</th>
                <th className="text-end">{t('proposed')}</th>
              </tr>
            </thead>
            <tbody>
              {r.budgets.map((b) => (
                <tr key={b.orgUnitId ?? 'company'} className={!b.within ? 'text-red-700' : ''}>
                  <td className="py-1">
                    {b.orgUnitId
                      ? (org?.orgUnits.find((u) => u.id === b.orgUnitId)?.name ??
                        r.lines.find((l) => l.orgUnit?.id === b.orgUnitId)?.orgUnit?.name ??
                        t('unit'))
                      : t('companyBudget')}
                  </td>
                  <td className="text-end">{taka(b.monthlyAmount)}</td>
                  <td className="text-end">
                    {taka(b.proposed)} {!b.within && t('overBudget')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {r.lines.map((line) => (
        <Card
          key={line.id}
          title={`${line.employee.employeeCode} · ${personName(line.employee, locale)}`}
        >
          <div className="mb-3 space-y-1 text-sm">
            <p>
              {line.orgUnit?.name} · {line.grade?.name} · {t('rating')}:{' '}
              {line.rating === null ? '—' : f.number(line.rating)}
            </p>
            {r.cycleId && <p>{t(line.incrementRecommended ? 'recommended' : 'notRecommended')}</p>}
            <p>
              {t('suggested', { percent: f.number(Number(line.suggestedPercent)) })}{' '}
              {line.band && `· ${t(`bands.${line.band}`)}`}
            </p>
            <p>{t('proposedPercent', { percent: f.number(Number(line.percent)) })}</p>
            <p>
              {t('gross')}: {taka(line.grossBefore)} → <strong>{taka(line.grossAfter)}</strong> ·{' '}
              {t('basic')}: {taka(line.basicBefore)} → {taka(line.basicAfter)}
            </p>
            {r.rmgAnnual && (
              <p>
                {t('minimumBasic')}: {taka(line.minimumBasic)}
              </p>
            )}
            <p>
              {line.payStatus
                ? t(`payStatuses.${line.payStatus}`)
                : line.submitted
                  ? t('submitted')
                  : t('draft')}
            </p>
            {line.reason && <p className="text-slate-600">{line.reason}</p>}
          </div>
          {line.canEdit && (
            <ProposalForm key={`${line.id}:${line.version}`} roundId={id} line={line} />
          )}
        </Card>
      ))}
      {r.skipped.length > 0 && (
        <Card title={t('skipped')}>
          <ul className="space-y-1 text-sm">
            {r.skipped.map((s) => (
              <li key={s.employee.id}>
                {personName(s.employee, locale)} · {t(`skipReasons.${s.reason}`)}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {org && (
        <>
          <Card title={t('budgets')}>
            <BudgetsForm org={org} round={r} />
          </Card>
          <Card>
            <RoundActions id={id} />
          </Card>
        </>
      )}
      {r.status === 'payroll' && (
        <Banner tone="green">
          {t('payrollHint')}{' '}
          <Link href="/workspace/approvals" className="underline">
            {t('approvals')}
          </Link>
        </Banner>
      )}
    </>
  );
}
