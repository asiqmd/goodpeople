import {
  can,
  COMPLIANCE_ALERT_KINDS,
  COMPLIANCE_ALERT_STATUSES,
  type ComplianceAlertPage,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AcknowledgeForm } from '@/components/compliance/compliance-forms';
import {
  AlertMeasure,
  ComplianceTabs,
  period,
  referenceOf,
  Section,
  STATUS_TONE,
} from '@/components/compliance/compliance-views';
import { Badge, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const PAGE_SIZE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

const param = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function ComplianceAlertsPage({
  searchParams,
}: PageProps<'/workspace/compliance/alerts'>) {
  if (!can((await currentTenantUser())?.role, 'compliance.manage')) redirect('/workspace');
  const t = await getTranslations('compliance');
  const format = await getFormatter();
  const sp = await searchParams;
  const kind = (COMPLIANCE_ALERT_KINDS as readonly string[]).includes(param(sp.kind))
    ? param(sp.kind)
    : '';
  const status = (COMPLIANCE_ALERT_STATUSES as readonly string[]).includes(param(sp.status))
    ? param(sp.status)
    : '';
  const from = DATE.test(param(sp.from)) ? param(sp.from) : '';
  const to = DATE.test(param(sp.to)) ? param(sp.to) : '';
  const employee = UUID.test(param(sp.employee)) ? param(sp.employee) : '';
  const page = Math.max(1, Number(param(sp.page)) || 1);

  const filters = { kind, status, from, to, employee };
  const link = (changes: Partial<Record<keyof typeof filters | 'page', string>>) =>
    `?${new URLSearchParams(Object.entries({ ...filters, ...changes }).filter(([, v]) => v))}`;
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  for (const [k, v] of Object.entries({ kind, status, from, to, employeeId: employee })) {
    if (v) query.set(k, v);
  }
  const data = await load<ComplianceAlertPage>('tenant', `/tenant/compliance/alerts?${query}`);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ComplianceTabs active="alerts" />
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('alerts.kind')}</span>
          <select name="kind" defaultValue={kind} className={`${inputClass} mt-1`}>
            <option value="">{t('alerts.allKinds')}</option>
            {COMPLIANCE_ALERT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('alerts.status')}</span>
          <select name="status" defaultValue={status} className={`${inputClass} mt-1`}>
            <option value="">{t('alerts.allStatuses')}</option>
            {COMPLIANCE_ALERT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('alerts.from')}</span>
          <input type="date" name="from" defaultValue={from} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-800">{t('alerts.to')}</span>
          <input type="date" name="to" defaultValue={to} className={`${inputClass} mt-1`} />
        </label>
        {employee && <input type="hidden" name="employee" value={employee} />}
        <button className={buttonClass.secondary}>{t('alerts.show')}</button>
        {employee && (
          <Link
            href={link({ employee: '' })}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            {t('alerts.everyone')}
          </Link>
        )}
      </form>
      <p className="text-xs text-slate-500">{t('alerts.hint')}</p>

      <Card>
        {data.items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('alerts.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('alerts.what')}</th>
                  <th className="py-2 pr-3 font-medium">{t('alerts.who')}</th>
                  <th className="py-2 pr-3 font-medium">{t('alerts.period')}</th>
                  <th className="py-2 pr-3 font-medium">{t('alerts.measure')}</th>
                  <th className="py-2 pr-3 font-medium">{t('alerts.status')}</th>
                  <th className="py-2 font-medium">{t('alerts.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{t(`kinds.${a.kind}`)}</span>{' '}
                      <Section reference={referenceOf(a)} />
                    </td>
                    <td className="py-2 pr-3">
                      {a.employee ? (
                        <>
                          <Link
                            href={`/workspace/employees/${a.employee.id}?tab=attendance`}
                            className="hover:underline"
                          >
                            {a.employee.fullName}
                          </Link>{' '}
                          <span className="font-mono text-xs text-slate-400">
                            {a.employee.employeeCode}
                          </span>
                        </>
                      ) : (
                        (a.subjectName ?? '—')
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {period(format, a.periodStart, a.periodEnd)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      <AlertMeasure alert={a} />
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS_TONE[a.status]}>{t(`statuses.${a.status}`)}</Badge>
                    </td>
                    <td className="max-w-xs py-2">
                      {a.note && (
                        <p className="text-slate-700">
                          {a.note}
                          {a.acknowledgedBy && (
                            <span className="block text-xs text-slate-500">
                              {t('alerts.acknowledgedBy', {
                                name: a.acknowledgedBy.name,
                                date: format.dateTime(new Date(a.acknowledgedAt!), {
                                  dateStyle: 'medium',
                                }),
                              })}
                            </span>
                          )}
                        </p>
                      )}
                      {a.status === 'open' && <AcknowledgeForm alertId={a.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={link({ page: String(page - 1) })}>← {t('alerts.previous')}</Link>
            ) : (
              <span />
            )}
            <span className="text-slate-500">
              {t('alerts.page', { page: format.number(page), pages: format.number(pages) })}
            </span>
            {page < pages ? (
              <Link href={link({ page: String(page + 1) })}>{t('alerts.next')} →</Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </Card>
    </>
  );
}
