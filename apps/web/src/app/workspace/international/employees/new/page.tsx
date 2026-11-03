import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { can, type InternationalOverview } from '@gp/shared';
import { authedFetch, currentTenantUser } from '@/lib/api';
import { Card, Banner } from '@/components/ui';
import { InternationalEmployeeForm } from '@/components/international-employee-forms';
export default async function NewInternationalEmployee({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await currentTenantUser();
  if (!can(user, 'employees.write')) notFound();
  const { company } = await searchParams,
    result = await authedFetch<InternationalOverview>('tenant', '/tenant/international');
  if (!result.ok) notFound();
  const profile = result.data.profiles.find(
    (p) => p.legalEntityId === company && !p.effectiveTo && p.countryCode !== 'BD',
  );
  if (!profile) notFound();
  const t = await getTranslations('international.employee');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {t('hire')} · {profile.companyName}
      </h1>
      <Banner tone="amber">{t('gate')}</Banner>
      <Card>
        <InternationalEmployeeForm
          op="hire"
          companyId={profile.legalEntityId}
          country={profile.countryCode}
          currency={profile.currency}
        />
      </Card>
    </div>
  );
}
