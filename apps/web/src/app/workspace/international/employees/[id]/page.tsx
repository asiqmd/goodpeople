import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { COUNTRY_DEFAULTS, type EmployeeDetail } from '@gp/shared';
import { authedFetch, currentTenantUser } from '@/lib/api';
import { Card, Banner } from '@/components/ui';
import { InternationalEmployeeForm } from '@/components/international-employee-forms';
export default async function InternationalEmployee({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    [record, data, user] = await Promise.all([
      authedFetch<EmployeeDetail>('tenant', '/tenant/employees/' + id),
      authedFetch<{
        profiles: {
          id: string;
          originalName: string;
          effectiveFrom: string;
          effectiveTo: string | null;
          citizenship: string;
          suppliedHijriDate: string | null;
          calendarProvenance: string | null;
        }[];
        identifiers: { id: string; kind: string; issuer: string; last4: string }[];
      }>('tenant', '/tenant/international/employees/' + id),
      currentTenantUser(),
    ]);
  if (!record.ok || !data.ok || !record.data.currentJob) notFound();
  const employer = record.data.currentJob.legalEntity,
    company = await authedFetch<{ countryCode: 'BD' | 'AE' | 'SA' }>(
      'tenant',
      '/tenant/legal-entities/' + employer.id,
    );
  if (!company.ok || !['BD', 'AE', 'SA'].includes(company.data.countryCode)) notFound();
  const country = company.data.countryCode,
    t = await getTranslations('international.employee'),
    props = {
      employeeId: id,
      companyId: employer.id,
      country,
      currency: COUNTRY_DEFAULTS[country].currency,
    };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" dir="auto">
        {record.data.fullName}
      </h1>
      <Link className="underline" href={'/workspace/employees/' + id}>
        {t('core')}
      </Link>
      <Banner tone="amber">{t('gate')}</Banner>
      <Card title={t('profiles')}>
        {data.data.profiles.map((p) => (
          <p key={p.id} dir="auto">
            {p.originalName} ·{' '}
            <bdi>
              {p.effectiveFrom} — {p.effectiveTo ?? '…'}
            </bdi>{' '}
            · {p.citizenship}
            {p.suppliedHijriDate && (
              <span>
                {' '}
                · <bdi>{p.suppliedHijriDate}</bdi> · {p.calendarProvenance}
              </span>
            )}
          </p>
        ))}
        {user?.fieldPolicy?.identity.write !== false && (
          <InternationalEmployeeForm
            op="employment-profiles"
            originalName={record.data.fullName}
            {...props}
          />
        )}
      </Card>
      <Card title={t('identifiers')}>
        {data.data.identifiers.map((i) => (
          <p key={i.id}>
            <bdi>
              {i.kind} · {i.issuer} · ••••{i.last4}
            </bdi>
          </p>
        ))}
        {user?.fieldPolicy?.identity.write !== false && (
          <InternationalEmployeeForm op="identifiers" {...props} />
        )}
      </Card>
      {country !== 'BD' && user?.fieldPolicy?.bank.write !== false && (
        <Card title={t('banks')}>
          <InternationalEmployeeForm op="banks" {...props} />
        </Card>
      )}
    </div>
  );
}
