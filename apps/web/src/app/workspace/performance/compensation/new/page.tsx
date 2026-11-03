import { can, type OrgSnapshot, type OutcomeCycle } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CompensationForm } from '@/components/compensation/forms';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function NewCompensationPage() {
  if (!can((await currentTenantUser())?.role, 'compensation.manage'))
    redirect('/workspace/performance/compensation');
  const t = await getTranslations('compensation');
  const [org, cycles] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<OutcomeCycle[]>('tenant', '/tenant/performance/outcomes/cycles'),
  ]);
  return (
    <>
      <div>
        <Link href="/workspace/performance/compensation" className="text-sm text-slate-500">
          ← {t('title')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('new')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('createHint')}</p>
      </div>
      <Card>
        <CompensationForm org={org} cycles={cycles} />
      </Card>
    </>
  );
}
