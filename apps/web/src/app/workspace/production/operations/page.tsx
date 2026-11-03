import { can, type ProductionOperationView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { localName, rate } from '@/components/production/labels';
import { ActiveToggle, OperationForm } from '@/components/production/operation-forms';
import { ProductionTabs } from '@/components/production/production-tabs';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function ProductionOperationsPage({
  searchParams,
}: PageProps<'/workspace/production/operations'>) {
  if (!can((await currentTenantUser())?.role, 'production.manage')) redirect('/workspace');
  const t = await getTranslations('production.operations');
  const format = await getFormatter();
  const locale = await getLocale();
  const sp = await searchParams;
  const operations = await load<ProductionOperationView[]>(
    'tenant',
    '/tenant/production/operations',
  );
  const editing = operations.find((o) => o.id === sp.edit);

  return (
    <>
      <ProductionTabs active="operations" />
      <Card
        title={editing ? t('editTitle', { code: editing.code }) : t('addTitle')}
        action={
          editing && (
            <Link href="/workspace/production/operations" className="text-sm text-slate-600">
              {t('cancelEdit')}
            </Link>
          )
        }
      >
        <OperationForm key={editing?.id ?? 'new'} operation={editing} />
      </Card>
      <Card title={t('listTitle')}>
        {operations.length === 0 ? (
          <p className="text-sm text-slate-500">{t('none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-slate-500">
                <tr>
                  <th className="py-2 pe-3 font-medium">{t('code')}</th>
                  <th className="py-2 pe-3 font-medium">{t('name')}</th>
                  <th className="py-2 pe-3 font-medium">{t('style')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('pieceRate')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('dailyTarget')}</th>
                  <th className="py-2 pe-3 text-end font-medium">{t('incentiveRate')}</th>
                  <th className="py-2 pe-3 font-medium">{t('status')}</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operations.map((o) => (
                  <tr key={o.id} className={o.isActive ? undefined : 'text-slate-400'}>
                    <td className="py-2 pe-3 font-mono text-xs">{o.code}</td>
                    <td className="py-2 pe-3">{localName(o, locale)}</td>
                    <td className="py-2 pe-3">{o.style}</td>
                    <td className="py-2 pe-3 text-end tabular-nums">
                      {o.pieceRate !== null && rate(format, o.pieceRate)}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums">
                      {o.dailyTarget !== null && format.number(o.dailyTarget)}
                    </td>
                    <td className="py-2 pe-3 text-end tabular-nums">
                      {o.incentiveRate !== null && rate(format, o.incentiveRate)}
                    </td>
                    <td className="py-2 pe-3">
                      <Badge tone={o.isActive ? 'green' : 'slate'}>
                        {o.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </td>
                    <td className="space-x-3 py-2 text-end whitespace-nowrap">
                      <Link
                        href={`/workspace/production/operations?edit=${o.id}`}
                        className="text-sm font-medium text-slate-700 hover:underline"
                      >
                        {t('edit')}
                      </Link>
                      <ActiveToggle operation={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
