import { MAX_IMPORT_ROWS } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ImportEmployeesForm } from '@/components/lifecycle/lifecycle-forms';
import { buttonClass, Card } from '@/components/ui';
import { currentTenantUser } from '@/lib/api';
import { isHrRole } from '@/lib/roles';

export default async function ImportEmployeesPage() {
  if (!isHrRole((await currentTenantUser())?.role)) redirect('/workspace');
  const t = await getTranslations('lifecycle.import');
  return (
    <>
      <Link href="/workspace/employees" className="text-sm text-slate-500 hover:text-slate-900">
        ← {t('back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Card title={t('step1')}>
        <p className="mb-3 text-sm text-slate-600">{t('step1Hint', { max: MAX_IMPORT_ROWS })}</p>
        {/* A file from a route handler, not a page: a plain link downloads it. */}
        {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
        <a href="/workspace/files/import-template" className={buttonClass.secondary}>
          {t('template')}
        </a>
      </Card>
      <Card title={t('step2')}>
        <p className="mb-3 text-sm text-slate-600">{t('step2Hint')}</p>
        <ImportEmployeesForm />
      </Card>
    </>
  );
}
