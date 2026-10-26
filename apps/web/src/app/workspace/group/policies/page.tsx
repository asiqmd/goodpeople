import { can, type GroupPoliciesView, type PolicyView } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { GroupTabs } from '@/components/group/group-tabs';
import { PolicyTable } from '@/components/group/policy-table';
import { Badge, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

export default async function GroupPoliciesPage() {
  if (!can((await currentTenantUser())?.role, 'org.manage')) redirect('/workspace/group');
  const t = await getTranslations('group');
  const locale = await getLocale();
  const result = await authedFetch<GroupPoliciesView>('tenant', '/tenant/group/policies');
  const header = (
    <div>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('policies.intro')}</p>
    </div>
  );
  if (!result.ok) {
    return (
      <>
        {header}
        <Card>
          <p className="text-sm text-slate-600">
            {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
          </p>
        </Card>
      </>
    );
  }
  const title = (p: PolicyView) =>
    p.leaveType
      ? (locale === 'bn' && p.leaveType.nameBn) || p.leaveType.name
      : t(`policies.areas.${p.area}`);

  return (
    <>
      {header}
      <GroupTabs active="policies" policies />
      {result.data.policies.map((policy) => (
        <Card
          key={`${policy.area}:${policy.leaveType?.id ?? ''}`}
          title={title(policy)}
          action={
            policy.leaveType?.statutoryKey ? (
              <Badge tone="violet">{t('policies.statutory')}</Badge>
            ) : null
          }
        >
          <p className="-mt-2 mb-3 text-xs text-slate-500">{t(`policies.hints.${policy.area}`)}</p>
          <PolicyTable policy={policy} />
        </Card>
      ))}
    </>
  );
}
