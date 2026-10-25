import {
  addDays,
  can,
  todayIn,
  type CheckOffReport,
  type OrgSnapshot,
  type UnionListView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { taka } from '@/components/payroll/payroll-views';
import { RelationsNav, RuleRef } from '@/components/relations/relations-views';
import { UnionForm } from '@/components/relations/union-forms';
import { Badge, Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const isMonth = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export default async function UnionsPage({
  searchParams,
}: PageProps<'/workspace/compliance/unions'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'compliance.manage')) redirect('/workspace');
  const tu = await getTranslations('relations.unions');
  const tk = await getTranslations('relations.checkOff');
  const format = await getFormatter();
  const query = await searchParams;
  // By default the last month that has ended: its run is the one likely locked.
  const month = isMonth(query.month)
    ? query.month
    : addDays(`${todayIn().slice(0, 7)}-01`, -1).slice(0, 7);
  const unionId = isId(query.unionId) ? query.unionId : '';
  const filter = new URLSearchParams({ month, ...(unionId ? { unionId } : {}) }).toString();
  const [list, report, org] = await Promise.all([
    load<UnionListView>('tenant', '/tenant/relations/unions'),
    load<CheckOffReport>('tenant', `/tenant/relations/check-off?${filter}`),
    load<OrgSnapshot>('tenant', '/tenant/org'),
  ]);
  const entities = org.legalEntities.filter((e) => e.isActive);
  const checkOffUnions = list.unions.filter((u) => u.checkOff);

  return (
    <>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{tu('title')}</h1>
        <RelationsNav current="unions" />
        <p className="text-sm text-slate-600">{tu('intro')}</p>
      </div>

      {list.counts
        .filter((c) => c.over)
        .map((c) => (
          <Banner key={c.legalEntity.id} tone="amber">
            {tu('over', {
              company: c.legalEntity.name,
              count: c.unions,
              max: c.max ?? 0,
              section: c.rule.reference.section,
            })}
          </Banner>
        ))}

      <Card title={tu('list')}>
        {list.unions.length === 0 ? (
          <p className="text-sm text-slate-500">{tu('empty')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tu('columns.name')}</th>
                  <th className="px-3 py-2 font-medium">{tu('columns.company')}</th>
                  <th className="px-3 py-2 font-medium">{tu('columns.registration')}</th>
                  <th className="px-3 py-2 font-medium">{tu('columns.subscription')}</th>
                  <th className="px-3 py-2 text-right font-medium">{tu('columns.members')}</th>
                  <th className="px-3 py-2 text-right font-medium">{tu('columns.consenting')}</th>
                  <th className="px-5 py-2 font-medium">{tu('columns.threshold')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.unions.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-2">
                      <Link
                        href={`/workspace/compliance/unions/${u.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {u.name}
                      </Link>
                      {u.isCba && (
                        <span className="ml-2">
                          <Badge tone="violet">{tu('cba')}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{u.legalEntity.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {u.registrationNo ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {u.checkOff && u.monthlySubscription ? (
                        <>
                          <Badge tone="blue">{tu('checkOff')}</Badge>{' '}
                          {tu('perMonth', { amount: taka(format, u.monthlySubscription) })}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {format.number(u.members)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {format.number(u.consenting)}
                    </td>
                    <td className="px-5 py-2">
                      <Badge tone={u.threshold.ok ? 'green' : 'amber'}>
                        {tu('threshold', {
                          members: u.threshold.members,
                          required: u.threshold.required,
                        })}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title={tk('title')}
        action={
          <a
            href={`/workspace/compliance/unions/check-off?${filter}`}
            className={buttonClass.secondary}
          >
            {tk('csv')}
          </a>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {tk('intro', {
              days: report.depositDays,
              rule: `s.${report.rule.reference.section}`,
            })}{' '}
            <RuleRef rule={report.rule} />
          </p>
          <form action="/workspace/compliance/unions" className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="font-medium text-slate-800">{tk('month')}</span>
              <input
                type="month"
                name="month"
                defaultValue={month}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-slate-800">{tk('union')}</span>
              <select name="unionId" defaultValue={unionId} className={`${inputClass} mt-1`}>
                <option value="">{tk('allUnions')}</option>
                {checkOffUnions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={buttonClass.secondary}>{tk('show')}</button>
          </form>
          {report.unlockedRuns > 0 && (
            <Banner tone="amber">{tk('unlocked', { count: report.unlockedRuns })}</Banner>
          )}
          {report.unions.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {report.unions.map((u) => (
                <li key={u.union.id} className="rounded-lg p-4 text-sm ring-1 ring-slate-200">
                  <p className="font-semibold text-slate-900">{u.union.name}</p>
                  <p className="text-slate-700">
                    {tk('totals', {
                      members: u.members,
                      expected: taka(format, u.expected),
                      deducted: taka(format, u.deducted),
                    })}
                  </p>
                  {u.depositDueOn && (
                    <p className="font-medium text-slate-900">
                      {tk('depositDue', { date: day(format, u.depositDueOn) })}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    {tk('payDirectly', { count: u.payDirectly })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {report.rows.length === 0 ? (
            <p className="text-sm text-slate-500">{tk('none')}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">{tk('columns.employee')}</th>
                    <th className="px-3 py-2 font-medium">{tk('columns.union')}</th>
                    <th className="px-3 py-2 font-medium">{tk('columns.consent')}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {tk('columns.subscription')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">{tk('columns.deducted')}</th>
                    <th className="px-3 py-2 font-medium">{tk('columns.payGroup')}</th>
                    <th className="px-3 py-2 font-medium">{tk('columns.paid')}</th>
                    <th className="px-5 py-2 font-medium">{tk('columns.due')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((r) => (
                    <tr key={`${r.union.id}:${r.employee.id}`}>
                      <td className="px-5 py-2">
                        <span className="font-medium text-slate-900">{r.employee.fullName}</span>{' '}
                        <span className="font-mono text-xs text-slate-400">
                          {r.employee.employeeCode}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.union.name}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {day(format, r.checkOffConsentOn)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {taka(format, r.subscription)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.deducted === null ? (
                          <span className="text-slate-500">{tk('notInRun')}</span>
                        ) : (
                          <>
                            {taka(format, r.deducted)}
                            {r.deducted !== r.subscription && (
                              <span className="block text-xs text-amber-700">{tk('differs')}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.payGroup ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.paymentDate ? day(format, r.paymentDate) : '—'}
                      </td>
                      <td className="px-5 py-2 text-slate-700">
                        {r.depositDueOn ? day(format, r.depositDueOn) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {entities.length > 0 && (
        <Card title={tu('new')}>
          <UnionForm entities={entities} />
        </Card>
      )}
    </>
  );
}
