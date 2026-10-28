import {
  can,
  OPENING_STATUSES,
  type LegalEntityView,
  type OpeningListItem,
  type OpeningStatus,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpLink } from '@/components/help/help-link';
import { day } from '@/components/leave/leave-views';
import {
  OpeningStatusBadge,
  personName,
  postTitle,
  StageCounts,
} from '@/components/recruitment/opening-views';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const tab = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
  }`;

/** Openings by status, with their applications by stage: the recruitment landing page. */
export default async function RecruitmentPage({
  searchParams,
}: PageProps<'/workspace/recruitment'>) {
  const t = await getTranslations('openings');
  const tp = await getTranslations('pipeline');
  const format = await getFormatter();
  const locale = await getLocale();
  const manage = can((await currentTenantUser())?.role, 'recruitment.manage');
  const query = await searchParams;
  const wanted = one(query.status);
  const status = OPENING_STATUSES.includes(wanted as OpeningStatus)
    ? (wanted as OpeningStatus)
    : null;
  const company = one(query.company) ?? '';
  const result = await authedFetch<OpeningListItem[]>(
    'tenant',
    `/tenant/recruitment/openings${company ? `?legalEntityId=${encodeURIComponent(company)}` : ''}`,
  );
  if (!result.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">
          {t('title')}
          <HelpLink slug="recruitment" />
        </h1>
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const entities = (await load<LegalEntityView[]>('tenant', '/tenant/legal-entities')).filter(
    (e) => e.isActive,
  );
  const all = result.data;
  const shown = status ? all.filter((o) => o.status === status) : all;
  const href = (s: OpeningStatus | null) => {
    const params = new URLSearchParams({
      ...(s ? { status: s } : {}),
      ...(company ? { company } : {}),
    });
    return `/workspace/recruitment${params.size ? `?${params}` : ''}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {t('title')}
            <HelpLink slug="recruitment" />
          </h1>
          <p className="text-sm text-slate-600">{t('intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && (
            <>
              <Link href="/workspace/recruitment/candidates" className={buttonClass.secondary}>
                {tp('list.title')}
              </Link>
              <Link href="/workspace/recruitment/settings" className={buttonClass.secondary}>
                {t('list.settings')}
              </Link>
            </>
          )}
          <Link href="/workspace/recruitment/openings/new" className={buttonClass.primary}>
            {t('list.new')}
          </Link>
        </div>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {[null, ...OPENING_STATUSES].map((s) => {
              const n = s ? all.filter((o) => o.status === s).length : all.length;
              return (
                <Link
                  key={s ?? 'all'}
                  href={href(s)}
                  className={tab(s === status)}
                  aria-current={s === status}
                >
                  {s ? t(`status.${s}`) : t('list.all')}{' '}
                  <span className="text-xs text-slate-400 tabular-nums">{format.number(n)}</span>
                </Link>
              );
            })}
          </nav>
          {entities.length > 1 && (
            <form action="/workspace/recruitment" className="flex items-center gap-2">
              {status && <input type="hidden" name="status" value={status} />}
              <select
                name="company"
                defaultValue={company}
                aria-label={t('list.company')}
                className={inputClass}
              >
                <option value="">{t('list.allCompanies')}</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button className={buttonClass.secondary}>{t('list.filter')}</button>
            </form>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500">{t('list.none')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((o) => {
              const posted = postTitle(o, locale);
              return (
                <li key={o.id} className="flex flex-wrap items-start justify-between gap-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      <Link
                        href={`/workspace/recruitment/openings/${o.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {o.title}
                      </Link>
                      {posted && posted !== o.title && (
                        <span className="font-normal text-slate-500"> · {posted}</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-600">
                      {[
                        o.legalEntity.name,
                        o.location?.name,
                        t('list.positions', { count: o.headcount }),
                        o.hiringManager && personName(o.hiringManager, locale),
                        o.closesOn && t('list.closesOn', { date: day(format, o.closesOn) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {o.applications > 0 && (
                      <StageCounts
                        counts={o.counts}
                        href={`/workspace/recruitment/openings/${o.id}/pipeline`}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">
                      {t('list.applications', { count: o.applications })}
                    </span>
                    <OpeningStatusBadge status={o.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
