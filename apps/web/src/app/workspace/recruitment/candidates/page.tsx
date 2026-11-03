import { can, type CandidateListItem, type Page } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dhakaFormat, STAGE_TONE } from '@/components/recruitment/pipeline-views';
import { Badge, Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every candidate HR may see, found by name, email or mobile; by talent pool or opening. */
export default async function CandidatesPage({
  searchParams,
}: PageProps<'/workspace/recruitment/candidates'>) {
  if (!can((await currentTenantUser())?.role, 'recruitment.manage')) redirect('/workspace');
  const t = await getTranslations('pipeline');
  const format = await getFormatter();
  const { day } = await dhakaFormat();
  const query = await searchParams;
  const search = one(query.q)?.trim() ?? '';
  const pool = one(query.pool) === '1';
  const opening = UUID.test(one(query.openingId) ?? '') ? one(query.openingId)! : '';
  const page = Math.max(1, Number(one(query.page)) || 1);
  /** This page's address with some of its filters changed; an empty one is dropped. */
  const params = (changes: Record<string, string> = {}) =>
    new URLSearchParams(
      Object.entries({ q: search, pool: pool ? '1' : '', openingId: opening, ...changes }).filter(
        ([, v]) => v,
      ),
    );
  const api = new URLSearchParams({
    page: String(page),
    pageSize: '25',
    ...(search ? { search } : {}),
    ...(pool ? { talentPool: 'true' } : {}),
    ...(opening ? { openingId: opening } : {}),
  });
  const result = await authedFetch<Page<CandidateListItem>>(
    'tenant',
    `/tenant/recruitment/candidates?${api}`,
  );
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('list.title')}</h1>
        <Banner tone="amber">{result.error.message}</Banner>
      </>
    );
  }
  const { items, total, pageSize } = result.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/recruitment" className="text-sm text-slate-500 hover:underline">
          ← {t('list.back')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('list.title')}</h1>
        <p className="text-sm text-slate-600">{t('list.intro')}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="min-w-64 flex-1">
          <span className="sr-only">{t('list.search')}</span>
          <input
            name="q"
            defaultValue={search}
            placeholder={t('list.search')}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" name="pool" value="1" defaultChecked={pool} />
          {t('list.talentPool')}
        </label>
        {opening && <input type="hidden" name="openingId" value={opening} />}
        <button className={buttonClass.secondary}>{t('list.searchButton')}</button>
      </form>
      {opening && (
        <Banner tone="blue">
          {t('list.forOpening')}{' '}
          <Link
            href={`/workspace/recruitment/candidates?${params({ openingId: '' })}`}
            className="font-medium underline"
          >
            {t('list.clear')}
          </Link>
        </Banner>
      )}

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('list.none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-start text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-2 font-medium">{t('list.name')}</th>
                  <th className="px-3 py-2 font-medium">{t('list.contact')}</th>
                  <th className="px-3 py-2 font-medium">{t('list.applications')}</th>
                  <th className="px-5 py-2 font-medium">{t('list.updated')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-5 py-2">
                      <Link
                        href={`/workspace/recruitment/candidates/${c.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.fullName}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {t(`sources.${c.source}`)}
                      </span>
                      {c.talentPool && <Badge tone="green">{t('list.inPool')}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {c.email && <span className="block">{c.email}</span>}
                      {c.phone && <span className="block">{c.phone}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <ul className="space-y-1">
                        {c.applications.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/workspace/recruitment/applications/${a.id}`}
                              className="text-slate-800 hover:underline"
                            >
                              {a.openingTitle}
                            </Link>
                            <Badge tone={STAGE_TONE[a.stage]}>{t(`stages.${a.stage}`)}</Badge>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-5 py-2 whitespace-nowrap text-slate-600">
                      {day(c.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link
                href={`/workspace/recruitment/candidates?${params({ page: String(page - 1) })}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {t('list.previous')}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-slate-500">
              {t('list.page', { page: format.number(page), pages: format.number(pages) })}
            </span>
            {page < pages ? (
              <Link
                href={`/workspace/recruitment/candidates?${params({ page: String(page + 1) })}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {t('list.next')}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Card>
    </>
  );
}
