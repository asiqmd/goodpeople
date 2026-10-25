import type { AuditReportView, OrgSnapshot } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
/** Last calendar month: what an auditor usually samples. */
function lastMonth() {
  const [y, m] = todayIso().split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}
const dayOf = (format: Formatter, iso: string) =>
  format.dateTime(new Date(`${iso.slice(0, 10)}T00:00:00+06:00`), {
    dateStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  });
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const head = 'px-3 py-2 font-medium';
const cell = 'px-3 py-1.5';

function Figure({ label, value, bad }: { label: ReactNode; value: ReactNode; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-slate-200 py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${bad ? 'text-red-700' : ''}`}>{value}</span>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-5 mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className={head}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cell}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The buyer-audit report: a period and an establishment, with every figure an auditor
 * samples, read from the records that pay people. Printable in English and Bangla.
 */
export default async function AuditReportPage({
  searchParams,
}: PageProps<'/workspace/compliance/audit'>) {
  const t = await getTranslations('auditReport');
  const query = await searchParams;
  const range = lastMonth();
  const from = one(query.from) ?? range.start;
  const to = one(query.to) ?? range.end;
  const legalEntityId = one(query.legalEntityId);
  const locationId = one(query.locationId);
  const params = new URLSearchParams({ from, to });
  if (legalEntityId) params.set('legalEntityId', legalEntityId);
  if (locationId) params.set('locationId', locationId);

  const org = await load<OrgSnapshot>('tenant', '/tenant/org');
  const result = await authedFetch<AuditReportView>(
    'tenant',
    `/tenant/compliance/audit-report?${params}`,
  );
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <Link href="/workspace/compliance" className={buttonClass.ghost}>
          {t('back')}
        </Link>
      </div>
      <Card>
        <p className="mb-4 text-sm text-slate-600">{t('intro')}</p>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="font-medium">{t('from')}</span>
            <input type="date" name="from" defaultValue={from} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="font-medium">{t('to')}</span>
            <input type="date" name="to" defaultValue={to} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="font-medium">{t('company')}</span>
            <select
              name="legalEntityId"
              defaultValue={legalEntityId ?? ''}
              className={`${inputClass} mt-1`}
            >
              <option value="">{t('allCompanies')}</option>
              {org.legalEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-medium">{t('site')}</span>
            <select
              name="locationId"
              defaultValue={locationId ?? ''}
              className={`${inputClass} mt-1`}
            >
              <option value="">{t('allSites')}</option>
              {org.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonClass.secondary}>{t('show')}</button>
        </form>
      </Card>

      {!result.ok ? (
        <Banner tone="red">{result.error.message}</Banner>
      ) : (
        <Report report={result.data} params={params.toString()} />
      )}
    </>
  );
}

async function Report({ report: r, params }: { report: AuditReportView; params: string }) {
  const t = await getTranslations('auditReport');
  const format = await getFormatter();
  const n = (v: number) => format.number(v, { maximumFractionDigits: 1 });
  const day = (iso: string) => dayOf(format, iso);
  const file = (extra: string) => `/workspace/files/audit-report?${params}&${extra}`;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <a href={file('language=en')} className={buttonClass.primary}>
          {t('pdfEn')}
        </a>
        <a href={file('language=bn')} className={buttonClass.secondary}>
          {t('pdfBn')}
        </a>
        <a href={file('format=csv')} className={buttonClass.secondary}>
          {t('csv')}
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('workforce')}>
          <Figure label={t('total')} value={n(r.workforce.total)} />
          <Figure label={t('workers')} value={n(r.workforce.workers)} />
          <Figure label={t('staff')} value={n(r.workforce.staff)} />
          <Figure label={t('women')} value={n(r.workforce.women)} />
          <Figure label={t('men')} value={n(r.workforce.men)} />
          <Figure
            label={t('children')}
            value={n(r.workforce.children)}
            bad={r.workforce.children > 0}
          />
          <p className="mt-3 text-sm font-medium">{t('adolescents')}</p>
          {r.workforce.adolescents.length === 0 ? (
            <p className="text-sm text-slate-500">{t('none')}</p>
          ) : (
            <Table
              headers={[t('code'), t('name'), t('age'), t('certificate')]}
              rows={r.workforce.adolescents.map((a) => [
                a.code,
                a.name,
                n(a.age),
                a.certificateUntil ? (
                  day(a.certificateUntil)
                ) : (
                  <Badge key="certificate" tone="red">
                    {t('missing')}
                  </Badge>
                ),
              ])}
            />
          )}
        </Card>

        <Card title={t('hours')}>
          {!r.hours.tracked ? (
            <p className="text-sm text-slate-500">{t('notTracked')}</p>
          ) : (
            <>
              <Figure label={t('workerWeeks')} value={n(r.hours.workerWeeks)} />
              <Figure label={t('over48')} value={n(r.hours.weeksOver48)} />
              <Figure
                label={t('over60')}
                value={n(r.hours.weeksOver60)}
                bad={r.hours.weeksOver60 > 0}
              />
              <Figure label={t('maxWeek')} value={n(r.hours.maxWeeklyHours)} />
              <Figure label={t('avgWeek')} value={n(r.hours.averageWeeklyHours)} />
              <Figure
                label={t('over10')}
                value={n(r.hours.daysOver10)}
                bad={r.hours.daysOver10 > 0}
              />
              <Figure
                label={t('noHoliday')}
                value={n(r.hours.withoutWeeklyHoliday)}
                bad={r.hours.withoutWeeklyHoliday > 0}
              />
            </>
          )}
        </Card>

        <Card title={t('overtime')}>
          <Figure label={t('otTotal')} value={n(r.overtime.totalHours)} />
          <Figure label={t('otPeople')} value={n(r.overtime.people)} />
          <Figure label={t('otMaxMonth')} value={n(r.overtime.maxMonthlyHours)} />
          <Figure label={t('otAvgMonth')} value={n(r.overtime.averageMonthlyHours)} />
          {r.overtime.monthlyCapHours !== null && (
            <Figure
              label={t('otCap', { hours: r.overtime.monthlyCapHours })}
              value={n(r.overtime.overMonthlyCap)}
              bad={r.overtime.overMonthlyCap > 0}
            />
          )}
          <Figure
            label={t('otPaid')}
            value={t('otRecorded', {
              recorded: r.overtime.paid.recordedHours,
              paid: r.overtime.paid.paidHours,
            })}
            bad={r.overtime.paid.differences > 0}
          />
        </Card>

        <Card title={t('wages')}>
          <Figure label={t('onBoard')} value={n(r.wages.onWageBoard)} />
          <Figure
            label={t('belowMinimum')}
            value={n(r.wages.belowMinimum.length)}
            bad={r.wages.belowMinimum.length > 0}
          />
          {r.wages.runs.length > 0 && (
            <Table
              headers={[t('period'), t('payGroup'), t('due'), t('paid'), '']}
              rows={r.wages.runs.map((x) => [
                x.period,
                x.payGroup,
                day(x.paymentDue),
                x.paidOn ? day(x.paidOn) : '—',
                x.late ? (
                  <Badge key="late" tone="red">
                    {t('late')}
                  </Badge>
                ) : (
                  <Badge key="late" tone="green">
                    {t('onTime')}
                  </Badge>
                ),
              ])}
            />
          )}
        </Card>

        <Card title={t('leave')}>
          {r.leave.byType.map((x) => (
            <Figure
              key={x.code}
              label={`${x.code} ${x.name}`}
              value={t('daysPeople', { days: x.days, people: x.people })}
            />
          ))}
          <Figure label={t('festival')} value={n(r.leave.festivalHolidays)} />
          <p className="mt-3 text-sm font-medium">{t('maternity')}</p>
          <Figure label={t('cases')} value={n(r.leave.maternity.cases)} />
          <Figure label={t('paidOnTime')} value={n(r.leave.maternity.paidOnTime)} />
          <Figure
            label={t('paidLate')}
            value={n(r.leave.maternity.paidLate)}
            bad={r.leave.maternity.paidLate > 0}
          />
          <Figure
            label={t('overdue')}
            value={n(r.leave.maternity.overdue)}
            bad={r.leave.maternity.overdue > 0}
          />
        </Card>

        <Card title={t('grievances')}>
          <Figure label={t('received')} value={n(r.grievances.total)} />
          <Figure
            label={t('overdueGrievances')}
            value={n(r.grievances.overdue)}
            bad={r.grievances.overdue > 0}
          />
          <Figure
            label={t('medianReply')}
            value={
              r.grievances.medianDaysToFirstReply === null
                ? '—'
                : n(r.grievances.medianDaysToFirstReply)
            }
          />
        </Card>
      </div>

      <Card title={t('committees')}>
        {r.committees.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noCommittees')}</p>
        ) : (
          <Table
            headers={[
              t('committee'),
              t('workerSide'),
              t('employerSide'),
              t('lastMeeting'),
              t('meetings'),
            ]}
            rows={r.committees.map((c) => [
              c.name,
              n(c.workerMembers),
              n(c.employerMembers),
              c.lastMeeting ? day(c.lastMeeting) : '—',
              n(c.meetingsInPeriod),
            ])}
          />
        )}
        {r.unions.length > 0 && (
          <Table
            headers={[t('union'), t('members'), '']}
            rows={r.unions.map((u) => [
              u.name,
              n(u.members),
              u.isCba ? (
                <Badge key="cba" tone="blue">
                  {t('cba')}
                </Badge>
              ) : (
                ''
              ),
            ])}
          />
        )}
      </Card>
    </>
  );
}
