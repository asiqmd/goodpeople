import { can, todayIn, type MaternityCaseView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import {
  CancelMaternityCaseForm,
  CloseMaternityCaseForm,
  MaternityAverageForms,
  MaternityDatesForm,
  MaternityLeaveForm,
  MaternityPaymentForm,
} from '@/components/maternity/maternity-forms';
import {
  CaseStatusBadge,
  Cite,
  EligibleBadge,
  PartStatusBadge,
} from '@/components/maternity/maternity-views';
import { taka } from '@/components/payroll/payroll-views';
import { Badge, Banner, buttonClass, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function MaternityCasePage({
  params,
}: PageProps<'/workspace/leave/maternity/[id]'>) {
  if (!can((await currentTenantUser())?.role, 'leave.manage')) redirect('/workspace');
  const { id } = await params;
  const t = await getTranslations('maternity');
  const td = await getTranslations('maternity.detail');
  const tl = await getTranslations('lifecycle.separation.types');
  const tls = await getTranslations('leave.status');
  const format = await getFormatter();
  const locale = await getLocale();
  const c = await load<MaternityCaseView>('tenant', `/tenant/maternity/cases/${id}`);
  const today = todayIn();
  const open = c.status === 'open';
  const anyPaid = c.parts.some((p) => p.status === 'paid');
  const name =
    locale === 'bn' && c.employee.fullNameBn ? c.employee.fullNameBn : c.employee.fullName;
  const month = (ym: string) =>
    format.dateTime(new Date(`${ym}-01T00:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const { eligibility, average } = c;

  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/leave/maternity" className="text-sm text-slate-500 hover:underline">
          ← {t('title')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            {name}
            <span className="font-mono text-sm font-normal text-slate-400">
              {c.employee.employeeCode}
            </span>
            <CaseStatusBadge status={c.status} />
            <EligibleBadge eligible={c.eligible} />
          </h1>
          <div className="flex gap-2">
            <a
              href={`/workspace/files/maternity/${c.id}?language=en`}
              className={buttonClass.secondary}
            >
              {td('statementEn')}
            </a>
            <a
              href={`/workspace/files/maternity/${c.id}?language=bn`}
              className={buttonClass.secondary}
            >
              {td('statementBn')}
            </a>
          </div>
        </div>
      </div>

      {c.employee.status === 'separated' && (
        <Banner tone="amber">
          {td('separated', {
            date: c.employee.separatedOn ? day(format, c.employee.separatedOn) : '—',
          })}
        </Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={td('case')}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">{td('noticeOn')}</dt>
              <dd>{day(format, c.noticeOn)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{td('expectedDeliveryOn')}</dt>
              <dd>{day(format, c.expectedDeliveryOn)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{td('deliveredOn')}</dt>
              <dd>{c.deliveredOn ? day(format, c.deliveredOn) : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{td('proofOn')}</dt>
              <dd>
                {c.proofOn
                  ? day(format, c.proofOn)
                  : td('proofBy', { date: day(format, c.proofDeadline) })}{' '}
                <Cite rules={[c.rules.proofWithinMonths]} />
                {c.eligible && c.proofLate && (
                  <span className="mt-1 block">
                    <PartStatusBadge status="lost" />{' '}
                    <span className="text-xs text-red-700">
                      {td('proofLate', { date: day(format, c.proofDeadline) })}
                    </span>
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{td('option')}</dt>
              <dd>{t(`options.${c.paymentOption}.title`)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{td('nominee')}</dt>
              <dd>
                {c.nomineeName
                  ? `${c.nomineeName}${c.nomineeRelation ? ` (${c.nomineeRelation})` : ''}`
                  : td('nomineeNone')}
              </dd>
            </div>
            {c.note && (
              <div className="col-span-2">
                <dt className="text-slate-500">{td('note')}</dt>
                <dd className="whitespace-pre-line">{c.note}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card title={td('eligibility')}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start justify-between gap-3">
              <span>
                <span className="font-medium">
                  {td('service', { days: eligibility.service.rule.value })}
                </span>{' '}
                <Cite rules={[eligibility.service.rule]} />
                <span className="block text-slate-600">
                  {td('served', {
                    days: eligibility.service.days,
                    date: day(format, eligibility.service.joinedOn),
                  })}
                </span>
              </span>
              <MetBadge ok={eligibility.service.ok} />
            </li>
            <li className="flex items-start justify-between gap-3">
              <span>
                <span className="font-medium">
                  {td('children', { limit: eligibility.children.rule.value })}
                </span>{' '}
                <Cite rules={[eligibility.children.rule]} />
                <span className="block text-slate-600">
                  {td('surviving', { count: eligibility.children.surviving })}
                </span>
              </span>
              <MetBadge ok={eligibility.children.ok} />
            </li>
          </ul>
          <p className="mt-4 text-sm font-medium">
            {c.eligible ? td('eligibleText') : td('ineligibleText')}{' '}
            {!eligibility.children.ok && td('leaveStill')}
          </p>
        </Card>

        {c.eligible && (
          <Card title={td('average')} className="lg:col-span-2">
            {average ? (
              <div className="space-y-3 text-sm">
                <p className="text-slate-600">
                  {td('window', {
                    from: day(format, average.windowStart),
                    to: day(format, average.windowEnd),
                  })}{' '}
                  <Cite rules={[average.rule]} />
                </p>
                {average.source === 'payroll' ? (
                  <>
                    <div className="-mx-5 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-5 py-2 font-medium">{td('period')}</th>
                            <th className="px-5 py-2 text-right font-medium">{td('wages')}</th>
                            <th className="px-5 py-2 text-right font-medium">{td('worked')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {average.months.map((m) => (
                            <tr key={m.periodStart}>
                              <td className="px-5 py-2">{month(m.periodStart.slice(0, 7))}</td>
                              <td className="px-5 py-2 text-right tabular-nums">
                                {taka(format, m.wages)}
                              </td>
                              <td className="px-5 py-2 text-right tabular-nums">
                                {format.number(m.workedDays)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {average.missingMonths.length > 0 && (
                      <p className="text-amber-700">
                        {td('missing', { months: average.missingMonths.map(month).join(', ') })}
                      </p>
                    )}
                    <p className="font-medium">
                      {td('working', {
                        wages: taka(format, average.wages!),
                        days: average.workedDays!,
                        average: taka(format, average.averageDailyWage),
                      })}
                    </p>
                  </>
                ) : (
                  <p className="font-medium">
                    {td('entered', {
                      average: taka(format, average.averageDailyWage),
                      reason: average.reason ?? '',
                    })}
                  </p>
                )}
              </div>
            ) : (
              <Banner tone="amber">{td('noAverage')}</Banner>
            )}
            {open && !anyPaid && <MaternityAverageForms id={c.id} />}
          </Card>
        )}

        {(c.eligible || c.parts.length > 0) && (
          <Card title={td('parts')} className="lg:col-span-2">
            <p className="mb-3 text-sm text-slate-600">
              {td('benefit', { before: c.daysBefore, after: c.daysAfter, total: c.benefitDays })}{' '}
              <Cite rules={[c.rules.benefitDays, c.rules.daysBefore]} />
            </p>
            {c.parts.length === 0 ? (
              <p className="text-sm text-slate-500">{td('noParts')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {c.parts.map((p) => (
                  <li key={p.id} className="space-y-3 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {td('part', { part: p.part })}: {td(`covers.${p.covers}`)},{' '}
                          {td('days', { days: p.days })}
                        </p>
                        <p className="text-slate-600">
                          {td(`basis.${p.basis}`, { days: c.rules.paymentWorkingDays.value })}{' '}
                          <Cite rules={[c.rules.paymentWorkingDays]} />
                        </p>
                        {p.dueOn && (
                          <p className="text-slate-600">
                            {td('dueBy', { date: day(format, p.dueOn) })}
                          </p>
                        )}
                        {p.paidOn && (
                          <p className="text-slate-600">
                            {td(`paidOn.${p.method!}`, { date: day(format, p.paidOn) })}
                            {p.reference && ` · ${td('paidRef', { reference: p.reference })}`}
                            {p.paidBy && ` · ${td('paidBy', { name: p.paidBy })}`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">{taka(format, p.amount)}</span>
                        <PartStatusBadge status={p.status} />
                      </div>
                    </div>
                    {open && (p.status === 'due' || p.status === 'overdue') && (
                      <MaternityPaymentForm id={c.id} part={p.part} today={today} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {c.parts.some((p) => p.status === 'lost') && (
              <p className="mt-3 text-sm text-red-700">
                {td('lostNote', { date: day(format, c.proofDeadline) })}
              </p>
            )}
          </Card>
        )}

        {open && (
          <Card title={td('dates')} className="lg:col-span-2">
            <MaternityDatesForm
              id={c.id}
              expectedDeliveryOn={c.expectedDeliveryOn}
              deliveredOn={c.deliveredOn}
              proofOn={c.proofOn}
              today={today}
            />
          </Card>
        )}

        <Card title={td('leave')}>
          <p className="mb-3 text-sm text-slate-600">{td('leaveHint')}</p>
          {open ? (
            <MaternityLeaveForm id={c.id} linked={c.leaveRequest} options={c.leaveOptions} />
          ) : (
            <p className="text-sm">
              {c.leaveRequest
                ? td('leaveSpan', {
                    from: day(format, c.leaveRequest.startDate),
                    to: day(format, c.leaveRequest.endDate),
                    days: c.leaveRequest.days,
                    status: tls(c.leaveRequest.status),
                  })
                : '—'}
            </p>
          )}
        </Card>

        <Card title={td('protection')}>
          <p className="text-sm text-slate-700">
            {td('protectionText', {
              from: day(format, c.protection.from),
              to: day(format, c.protection.to),
            })}{' '}
            <Cite rules={c.protection.rules} />
          </p>
          {c.protection.separations.length > 0 && (
            <div className="mt-3 space-y-2">
              {c.protection.separations.map((s) => (
                <Banner key={s.id} tone="amber">
                  {td('separationNotice', { type: tl(s.type), date: day(format, s.noticeDate) })}
                </Banner>
              ))}
            </div>
          )}
        </Card>

        {open && (
          <Card title={td('finish')} className="lg:col-span-2">
            <div className="grid gap-6 sm:grid-cols-2">
              <CloseMaternityCaseForm id={c.id} />
              {!anyPaid && <CancelMaternityCaseForm id={c.id} />}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

async function MetBadge({ ok }: { ok: boolean }) {
  const t = await getTranslations('maternity.detail');
  return <Badge tone={ok ? 'green' : 'red'}>{ok ? t('met') : t('notMet')}</Badge>;
}
