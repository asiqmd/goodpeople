import { GRIEVANCE_CATEGORIES, GRIEVANCE_STATUSES, type GrievanceList } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CategoryIcon, localDigits, STATUS_TONE } from '@/components/grievances/parts';
import { Badge, Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { load, authedFetch } from '@/lib/api';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Workers' grievances, newest first, with how long each has waited against s.33. */
export default async function GrievancesPage({ searchParams }: PageProps<'/workspace/grievances'>) {
  // Handlers, and complaint committee members for harassment cases: the API decides.
  if (!(await authedFetch('tenant', '/tenant/grievances/access')).ok) redirect('/workspace');
  const t = await getTranslations('grievances');
  const format = await getFormatter();
  const locale = await getLocale();
  const query = await searchParams;
  const status = GRIEVANCE_STATUSES.find((s) => s === one(query.status));
  const category = GRIEVANCE_CATEGORIES.find((c) => c === one(query.category));
  const filter = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  }).toString();
  const list = await load<GrievanceList>(
    'tenant',
    `/tenant/grievances${filter ? `?${filter}` : ''}`,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('list.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('list.intro')}</p>
        </div>
        <Link href="/workspace/grievances/poster" className={buttonClass.secondary}>
          {t('list.poster')}
        </Link>
      </div>
      {list.committeeMissing && <Banner tone="amber">{t('list.committeeMissing')}</Banner>}
      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="font-medium text-slate-800">{t('list.status')}</span>
            <select name="status" defaultValue={status ?? ''} className={`${inputClass} mt-1`}>
              <option value="">{t('list.all')}</option>
              {GRIEVANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-medium text-slate-800">{t('list.category')}</span>
            <select name="category" defaultValue={category ?? ''} className={`${inputClass} mt-1`}>
              <option value="">{t('list.all')}</option>
              {GRIEVANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`categories.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonClass.secondary}>{t('list.filter')}</button>
        </form>
        {list.items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('list.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">{t('list.reference')}</th>
                  <th className="py-2 pr-4 font-medium">{t('list.category')}</th>
                  <th className="py-2 pr-4 font-medium">{t('list.status')}</th>
                  <th className="py-2 pr-4 font-medium">{t('list.raised')}</th>
                  <th className="py-2 pr-4 font-medium">{t('list.age')}</th>
                  <th className="py-2 font-medium">{t('list.site')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.items.map((g) => (
                  <tr key={g.id} className="align-top">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/workspace/grievances/${g.id}`}
                        className="font-mono font-medium text-brand-700 hover:underline"
                      >
                        {g.reference}
                      </Link>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {g.restricted && <Badge tone="violet">{t('list.restricted')}</Badge>}
                        <Badge tone="slate">
                          {g.anonymous ? t('list.anonymous') : t('list.named')}
                        </Badge>
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <CategoryIcon category={g.category} className="size-5 text-slate-500" />
                        {t(`categories.${g.category}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONE[g.status]}>{t(`statuses.${g.status}`)}</Badge>
                        {g.awaitingReply && <Badge tone="amber">{t('list.awaiting')}</Badge>}
                      </span>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {format.dateTime(new Date(g.createdAt), {
                        dateStyle: 'medium',
                        timeZone: 'Asia/Dhaka',
                      })}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {t('list.ageDays', { days: g.ageDays })}
                      {g.overdue && (
                        <span className="ml-2">
                          <Badge tone="red">{t('list.overdue')}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-slate-600">{g.location?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          {t('list.deadline', {
            days: list.deadline.days,
            act: list.deadline.reference.act,
            section: localDigits(list.deadline.reference.section, locale),
          })}
        </p>
      </Card>
    </>
  );
}
