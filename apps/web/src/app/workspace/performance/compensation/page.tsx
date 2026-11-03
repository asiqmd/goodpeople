import { can, type CompensationRoundListItem } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpLink } from '@/components/help/help-link';
import { day } from '@/components/leave/leave-views';
import { Banner, buttonClass, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

export default async function CompensationPage() {
  const t = await getTranslations('compensation');
  const f = await getFormatter();
  const user = await currentTenantUser();
  const result = await authedFetch<CompensationRoundListItem[]>('tenant', '/tenant/compensation');
  return (
    <>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Link href="/workspace/performance" className="text-sm text-slate-500">
            ← {t('performance')}
          </Link>
          <h1 className="text-2xl font-semibold">
            {t('title')}
            <HelpLink slug="compensation" />
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t('intro')}</p>
        </div>
        {can(user, 'compensation.manage') && (
          <Link href="/workspace/performance/compensation/new" className={buttonClass.primary}>
            {t('new')}
          </Link>
        )}
      </div>
      {!result.ok ? (
        <Banner tone="amber">{result.error.message}</Banner>
      ) : (
        <Card>
          {!result.data.length ? (
            <p className="text-sm text-slate-500">{t('none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {result.data.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-3 py-3">
                  <div>
                    <Link
                      href={`/workspace/performance/compensation/${r.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-sm text-slate-600">
                      {r.company.name} · {day(f, r.effectiveFrom)} ·{' '}
                      {t('progress', {
                        submitted: f.number(r.submitted),
                        people: f.number(r.people),
                      })}
                    </p>
                  </div>
                  <span className="text-sm">{t(`statuses.${r.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
