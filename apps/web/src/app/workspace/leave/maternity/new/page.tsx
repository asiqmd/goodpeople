import { can, todayIn, type MaternityCandidate } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { NewMaternityCaseForm } from '@/components/maternity/maternity-forms';
import { buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function NewMaternityCasePage({
  searchParams,
}: PageProps<'/workspace/leave/maternity/new'>) {
  if (!can((await currentTenantUser())?.role, 'leave.manage')) redirect('/workspace');
  const t = await getTranslations('maternity.form');
  const tm = await getTranslations('maternity');
  const format = await getFormatter();
  const locale = await getLocale();
  const query = await searchParams;
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const chosenId = typeof query.employee === 'string' ? query.employee : null;
  const candidates = await load<MaternityCandidate[]>(
    'tenant',
    `/tenant/maternity/candidates${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  );
  // Choosing keeps the search, so the list she was chosen from still has her.
  const chosen = candidates.find((c) => c.id === chosenId) ?? null;
  const name = (c: MaternityCandidate) =>
    locale === 'bn' && c.fullNameBn ? c.fullNameBn : c.fullName;

  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/leave/maternity" className="text-sm text-slate-500 hover:underline">
          ← {tm('title')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
      </div>
      {chosen && !chosen.openCaseId ? (
        <Card
          title={
            <span>
              {name(chosen)}{' '}
              <span className="font-mono text-xs font-normal text-slate-400">
                {chosen.employeeCode}
              </span>
            </span>
          }
          action={
            <Link href="/workspace/leave/maternity/new" className={buttonClass.ghost}>
              {t('change')}
            </Link>
          }
        >
          <p className="mb-4 text-sm text-slate-600">
            {t('joined', { date: day(format, chosen.joinedOn) })}
          </p>
          <NewMaternityCaseForm employeeId={chosen.id} today={todayIn()} />
        </Card>
      ) : (
        <Card title={t('pick')}>
          <form className="mb-4 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="search">
              {t('search')}
            </label>
            <input
              id="search"
              name="search"
              defaultValue={search}
              placeholder={t('search')}
              className={`${inputClass} max-w-sm`}
            />
            <button className={buttonClass.secondary}>{t('searchButton')}</button>
          </form>
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noMatch')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {candidates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{name(c)}</span>{' '}
                    <span className="font-mono text-xs text-slate-400">{c.employeeCode}</span>
                    <span className="block text-xs text-slate-500">
                      {t('joined', { date: day(format, c.joinedOn) })}
                    </span>
                  </span>
                  {c.openCaseId ? (
                    <Link
                      href={`/workspace/leave/maternity/${c.openCaseId}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      {t('hasCase')} →
                    </Link>
                  ) : (
                    <Link
                      href={`/workspace/leave/maternity/new?${new URLSearchParams({ employee: c.id, ...(search ? { search } : {}) })}`}
                      className={buttonClass.secondary}
                    >
                      {t('choose')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
