import {
  ageOn,
  todayIn,
  type EmployeeDetail,
  type JobAssignmentView,
  type OrgSnapshot,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatAddress } from '@/lib/org';
import { CorrectJobForm } from '../lifecycle/lifecycle-forms';
import { Badge, Card } from '../ui';

function Dl({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-0.5 text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const day = (format: Awaited<ReturnType<typeof getFormatter>>, iso: string) =>
  format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

/** Name, code, current role and status badges. */
export async function EmployeeHeader({ employee }: { employee: EmployeeDetail }) {
  const t = await getTranslations('hr');
  const format = await getFormatter();
  const job = employee.currentJob;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{employee.fullName}</h1>
        {employee.fullNameBn && (
          <p lang="bn" className="text-slate-600">
            {employee.fullNameBn}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-500">
          {[employee.employeeCode, job?.designation?.name, job?.orgUnit?.name, job?.location?.name]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {job && <Badge tone="slate">{t(`employmentTypes.${job.employmentType}`)}</Badge>}
        {employee.isAdolescent && <Badge tone="amber">{t('employees.adolescent')}</Badge>}
        {employee.probationEndsOn && !employee.confirmedOn && (
          <Badge tone="blue">
            {t('detail.probationUntil', { date: day(format, employee.probationEndsOn) })}
          </Badge>
        )}
      </div>
    </div>
  );
}

export async function PersonalDetails({ employee }: { employee: EmployeeDetail }) {
  const t = await getTranslations('hr');
  const format = await getFormatter();
  const locale = await getLocale();
  const age = ageOn(employee.dateOfBirth, todayIn());
  const ec = employee.emergencyContact;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={t('form.personal')}>
        <Dl
          items={[
            [t('form.fatherName'), employee.fatherName],
            [t('form.motherName'), employee.motherName],
            [t('form.spouseName'), employee.spouseName],
            [t('form.dateOfBirth'), `${day(format, employee.dateOfBirth)} (${format.number(age)})`],
            [t('form.gender'), t(`genders.${employee.gender}`)],
            [t('form.religion'), employee.religion && t(`religions.${employee.religion}`)],
            [
              t('form.maritalStatus'),
              employee.maritalStatus && t(`maritalStatuses.${employee.maritalStatus}`),
            ],
            [t('form.bloodGroup'), employee.bloodGroup],
          ]}
        />
      </Card>
      <Card title={t('form.contact')}>
        <Dl
          items={[
            [t('form.mobilePhone'), employee.mobilePhone],
            [t('form.workEmail'), employee.workEmail],
            [t('form.personalEmail'), employee.personalEmail],
            [t('form.emergencyContact'), ec && `${ec.name} (${ec.relation}) · ${ec.phone}`],
            [t('detail.portalUser'), employee.portalUser?.email ?? t('detail.noPortal')],
          ]}
        />
      </Card>
      <Card title={t('form.identity')}>
        <Dl
          items={[
            [t('form.nid'), employee.identity.nid],
            [t('form.birthRegistration'), employee.identity.birthRegistration],
            [t('form.passport'), employee.identity.passport],
            [t('form.tin'), employee.identity.tin],
          ]}
        />
      </Card>
      <Card title={t('form.presentAddress')}>
        <Dl
          items={[
            [t('form.presentAddress'), formatAddress(employee.presentAddress, locale)],
            [t('form.permanentAddress'), formatAddress(employee.permanentAddress, locale)],
          ]}
        />
      </Card>
    </div>
  );
}

export async function JobSummary({ employee }: { employee: EmployeeDetail }) {
  const t = await getTranslations('hr');
  const format = await getFormatter();
  const job = employee.currentJob;
  if (!job) return <Card title={t('detail.currentJob')}>{t('detail.noJob')}</Card>;
  return (
    <Card title={t('detail.currentJob')}>
      <Dl
        items={[
          [t('form.legalEntity'), job.legalEntity.name],
          [t('form.location'), job.location?.name],
          [t('form.orgUnit'), job.orgUnit?.name],
          [t('form.designation'), job.designation?.name],
          [t('form.grade'), job.grade?.name],
          [t('form.costCentre'), job.costCentre?.name],
          [
            t('form.manager'),
            job.manager && `${job.manager.fullName} (${job.manager.employeeCode})`,
          ],
          [t('form.employmentType'), t(`employmentTypes.${job.employmentType}`)],
          [t('form.workerCategory'), t(`workerCategories.${job.workerCategory}`)],
          [t('form.joinedOn'), day(format, employee.joinedOn)],
          [t('form.confirmedOn'), employee.confirmedOn && day(format, employee.confirmedOn)],
        ]}
      />
    </Card>
  );
}

export async function JobHistory({
  history,
  correction,
}: {
  history: JobAssignmentView[];
  /** For HR: what correcting an entry needs. */
  correction?: { employeeId: string; org: OrgSnapshot; managers: { id: string; name: string }[] };
}) {
  const t = await getTranslations('hr');
  const format = await getFormatter();
  return (
    <Card title={t('detail.history')}>
      <ol className="space-y-4 border-l border-slate-200 pl-5">
        {history.map((j) => (
          <li key={j.id} className="relative">
            <span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
            <p className="text-sm font-medium">
              {t(`jobEvents.${j.event}`)}
              <span className="font-normal text-slate-500">
                {' · '}
                {j.effectiveTo
                  ? t('detail.period', {
                      from: day(format, j.effectiveFrom),
                      to: day(format, j.effectiveTo),
                    })
                  : t('detail.since', { from: day(format, j.effectiveFrom) })}
              </span>
            </p>
            <p className="text-sm text-slate-700">
              {[
                j.designation?.name,
                j.grade?.name,
                j.orgUnit?.name,
                j.location?.name,
                j.legalEntity.name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {j.reason && <p className="text-xs text-slate-500">{j.reason}</p>}
            {correction && <CorrectJobForm job={j} {...correction} />}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export async function NomineeList({ employee }: { employee: EmployeeDetail }) {
  const t = await getTranslations('hr.detail');
  const format = await getFormatter();
  return (
    <Card title={t('nominees')}>
      {employee.nominees.length === 0 ? (
        <p className="text-sm text-slate-500">{t('noNominees')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {employee.nominees.map((n) => (
            <li key={n.id} className="flex justify-between py-2">
              <span>
                {n.name} <span className="text-slate-500">({n.relation})</span>
              </span>
              <span className="font-medium">
                {format.number(n.sharePercent / 100, { style: 'percent' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function AccountList({ employee }: { employee: EmployeeDetail }) {
  const t = await getTranslations('hr');
  return (
    <Card title={t('detail.payment')}>
      {employee.paymentAccounts.length === 0 ? (
        <p className="text-sm text-slate-500">{t('detail.noAccounts')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {employee.paymentAccounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 py-2">
              <span>
                {t(`paymentMethods.${a.method}`)}
                {a.provider &&
                  ` · ${a.method === 'mfs' ? t(`mfsProviders.${a.provider}`) : a.provider}`}
                {a.accountNumberMasked && (
                  <span className="ml-2 font-mono text-slate-500">{a.accountNumberMasked}</span>
                )}
              </span>
              {a.isPrimary && <Badge tone="green">{t('detail.primary')}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
