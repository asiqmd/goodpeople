import { can, type LegalEntityView, type PerformanceSettingsView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CycleForm } from '@/components/performance/cycle-forms';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

/** A new review cycle, starting from the workspace's competencies. */
export default async function NewCyclePage() {
  if (!can((await currentTenantUser())?.role, 'performance.manage')) {
    redirect('/workspace/performance');
  }
  const t = await getTranslations('reviews');
  const [entities, settings] = await Promise.all([
    load<LegalEntityView[]>('tenant', '/tenant/legal-entities'),
    load<PerformanceSettingsView>('tenant', '/tenant/performance/settings'),
  ]);
  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/cycles"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('cycle.list.title')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('cycle.list.new')}</h1>
        <p className="text-sm text-slate-600">{t('cycle.form.intro')}</p>
      </div>
      <Card>
        <CycleForm
          entities={entities.filter((e) => e.isActive).map((e) => ({ id: e.id, name: e.name }))}
          competencies={settings.competencies}
        />
      </Card>
    </>
  );
}
