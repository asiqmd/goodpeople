import { can } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ImportForm } from '@/components/production/import-form';
import { ProductionTabs } from '@/components/production/production-tabs';
import { Card } from '@/components/ui';
import { currentTenantUser } from '@/lib/api';

export default async function ProductionImportPage() {
  if (!can((await currentTenantUser())?.role, 'production.manage')) redirect('/workspace');
  const t = await getTranslations('production.import');
  return (
    <>
      <ProductionTabs active="import" />
      <Card
        title={t('title')}
        action={
          // A file from a route handler, not a page: a plain link downloads it.
          // oxlint-disable-next-line nextjs/no-html-link-for-pages
          <a
            href="/workspace/files/production/template"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t('template')}
          </a>
        }
      >
        <div className="mb-4 space-y-1 text-sm text-slate-600">
          <p>{t('intro')}</p>
          <p className="text-xs text-slate-500">{t('headings')}</p>
          <p className="text-xs text-slate-500">{t('rules')}</p>
        </div>
        <ImportForm />
      </Card>
    </>
  );
}
