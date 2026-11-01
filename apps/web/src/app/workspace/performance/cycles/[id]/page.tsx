import {
  can,
  REVIEW_STATUSES,
  type CycleDetail,
  type CycleReviewItem,
  type LegalEntityView,
  type Page,
  type ReviewStatus,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import {
  AddPersonForm,
  CalibrateForm,
  CycleDatesForm,
  CycleForm,
  CycleMoveButton,
  LaunchButton,
} from '@/components/performance/cycle-forms';
import { CycleProgressView, CycleStatusBadge } from '@/components/performance/cycle-views';
import { RatingText, ReviewStatusBadge } from '@/components/performance/review-views';
import { personName } from '@/components/recruitment/opening-views';
import { Badge, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PAGE_SIZE = 50;

/** A cycle's set-up, launch, progress, calibration, release and closing, with its people. */
export default async function CyclePage({
  params,
  searchParams,
}: PageProps<'/workspace/performance/cycles/[id]'>) {
  if (!can((await currentTenantUser())?.role, 'performance.manage')) {
    redirect('/workspace/performance');
  }
  const { id } = await params;
  const found = await authedFetch<CycleDetail>('tenant', `/tenant/performance/cycles/${id}`);
  if (!found.ok && (found.status === 404 || found.status === 400)) notFound();
  if (!found.ok) throw new Error(found.error.message);
  const cycle = found.data;
  const t = await getTranslations('reviews');
  const format = await getFormatter();
  const locale = await getLocale();
  const query = await searchParams;
  const wanted = one(query.status);
  const status = REVIEW_STATUSES.includes(wanted as ReviewStatus) ? (wanted as ReviewStatus) : null;
  const search = one(query.search) ?? '';
  const page = Math.max(1, Number(one(query.page)) || 1);
  const href = (to: { status?: string | null; page?: number }) => {
    const shown = to.status === undefined ? status : to.status;
    const next = new URLSearchParams({
      ...(shown ? { status: shown } : {}),
      ...(search ? { search } : {}),
      ...(to.page && to.page > 1 ? { page: String(to.page) } : {}),
    });
    return `/workspace/performance/cycles/${id}${next.size ? `?${next}` : ''}`;
  };
  const draft = cycle.status === 'draft';
  const [people, entities] = await Promise.all([
    draft
      ? null
      : load<Page<CycleReviewItem>>(
          'tenant',
          `/tenant/performance/cycles/${id}/reviews?${new URLSearchParams({
            ...(status ? { status } : {}),
            ...(search ? { search } : {}),
            page: String(page),
            pageSize: String(PAGE_SIZE),
          })}`,
        ),
    draft && cycle.canChange ? load<LegalEntityView[]>('tenant', '/tenant/legal-entities') : null,
  ]);
  const pages = people ? Math.max(1, Math.ceil(people.total / PAGE_SIZE)) : 1;

  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/cycles"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('cycle.list.title')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cycle.name}</h1>
          <CycleStatusBadge status={cycle.status} />
        </div>
        <p className="text-sm text-slate-600">
          {[
            `${day(format, cycle.periodStart)} – ${day(format, cycle.periodEnd)}`,
            cycle.legalEntities.length
              ? cycle.legalEntities.map((e) => e.name).join(', ')
              : t('cycle.allCompanies'),
            cycle.joinedOnOrBefore &&
              t('cycle.joinedBy', { date: day(format, cycle.joinedOnOrBefore) }),
            cycle.selfReview ? t('cycle.withSelf') : t('cycle.withoutSelf'),
            cycle.peerReview && t('cycle.withPeers'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {draft && cycle.canChange && entities && (
        <>
          <Card title={t('cycle.setup')}>
            <CycleForm
              cycle={cycle}
              entities={entities.filter((e) => e.isActive).map((e) => ({ id: e.id, name: e.name }))}
              competencies={cycle.competencies}
            />
          </Card>
          <Card title={t('cycle.actions.launch')}>
            <LaunchButton cycle={cycle} />
          </Card>
        </>
      )}

      {!draft && (
        <Card title={t('cycle.progress.title')}>
          <CycleProgressView progress={cycle.progress} href={(s) => href({ status: s, page: 1 })} />
        </Card>
      )}

      {cycle.canChange && (cycle.status === 'active' || cycle.status === 'calibration') && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('cycle.dates')}>
            <CycleDatesForm cycle={cycle} />
          </Card>
          <Card
            title={cycle.status === 'active' ? t('cycle.nextStep') : t('cycle.actions.release')}
          >
            <div className="space-y-5">
              {cycle.status === 'active' && (
                <>
                  <CalibrateForm cycle={cycle} />
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <LaunchButton cycle={cycle} />
                    <AddPersonForm cycleId={cycle.id} />
                  </div>
                </>
              )}
              {cycle.status === 'calibration' && (
                <>
                  <p className="text-sm text-slate-600">
                    {t('cycle.actions.releaseHint', {
                      done: format.number(cycle.progress.withFinalRating),
                      total: format.number(cycle.progress.total),
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/workspace/performance/cycles/${id}/calibration`}
                      className={buttonClass.secondary}
                    >
                      {t('calibration.title')}
                    </Link>
                    <CycleMoveButton cycleId={id} move="release" />
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {(cycle.status === 'released' || cycle.status === 'closed') && (
        <Card title={t('cycle.outcomes')}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600">{t('cycle.outcomesHint')}</p>
            <a
              href={`/workspace/files/performance-outcomes?cycleId=${id}`}
              className={buttonClass.secondary}
            >
              {t('cycle.outcomesCsv')}
            </a>
            <Link
              href={`/workspace/performance/cycles/${id}/calibration`}
              className={buttonClass.secondary}
            >
              {t('calibration.title')}
            </Link>
            {cycle.status === 'released' && cycle.canChange && (
              <CycleMoveButton cycleId={id} move="close" />
            )}
          </div>
        </Card>
      )}

      {people && (
        <Card title={t('cycle.people')}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-1 text-sm">
              {[null, ...REVIEW_STATUSES].map((s) => (
                <Link
                  key={s ?? 'all'}
                  href={href({ status: s, page: 1 })}
                  aria-current={s === status}
                  className={`rounded-md px-2.5 py-1 ${s === status ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {s ? t(`status.${s}`) : t('cycle.all')}
                </Link>
              ))}
            </nav>
            <form className="flex gap-2">
              {status && <input type="hidden" name="status" value={status} />}
              <input
                name="search"
                defaultValue={search}
                placeholder={t('cycle.search')}
                aria-label={t('cycle.search')}
                className={`${inputClass} w-56`}
              />
              <button className={buttonClass.secondary}>{t('cycle.find')}</button>
            </form>
          </div>
          {people.items.length === 0 ? (
            <p className="text-sm text-slate-500">{t('cycle.nobody')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {people.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="space-y-0.5">
                    <Link
                      href={`/workspace/performance/reviews/${r.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      {personName(r.employee, locale)}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {[
                        r.employee.employeeCode,
                        r.manager
                          ? t('review.manager', { name: personName(r.manager, locale) })
                          : t('review.noManager'),
                        r.acknowledgedAt &&
                          (r.employeeAgrees ? t('acknowledge.agreed') : t('acknowledge.disagreed')),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {r.overdue && <Badge tone="red">{t('cycle.overdue')}</Badge>}
                    {(r.finalRating ?? r.proposedRating) !== null && (
                      <span className="text-slate-600">
                        {r.finalRating !== null
                          ? t('calibration.final')
                          : t('calibration.proposed')}{' '}
                        <RatingText rating={r.finalRating ?? r.proposedRating} />
                      </span>
                    )}
                    <ReviewStatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className="text-brand-700 hover:underline">
                  ← {t('cycle.previousPage')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-slate-500">
                {t('cycle.page', { page: format.number(page), pages: format.number(pages) })}
              </span>
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className="text-brand-700 hover:underline">
                  {t('cycle.nextPage')} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </Card>
      )}
    </>
  );
}
