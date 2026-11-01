import { can, type CalibrationView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FinalRatingForm } from '@/components/performance/calibration-forms';
import { DistributionChart } from '@/components/performance/calibration-views';
import { CycleStatusBadge } from '@/components/performance/cycle-views';
import { RatingText, ReviewStatusBadge } from '@/components/performance/review-views';
import { personName } from '@/components/recruitment/opening-views';
import { Badge, Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Proposed ratings side by side for a company, unit or manager, against the workspace's guide,
 * with HR's final rating for each person.
 */
export default async function CalibrationPage({
  params,
  searchParams,
}: PageProps<'/workspace/performance/cycles/[id]/calibration'>) {
  if (!can((await currentTenantUser())?.role, 'performance.manage')) {
    redirect('/workspace/performance');
  }
  const { id } = await params;
  const query = await searchParams;
  const filters = {
    legalEntityId: one(query.legalEntityId) ?? '',
    orgUnitId: one(query.orgUnitId) ?? '',
    managerEmployeeId: one(query.managerEmployeeId) ?? '',
  };
  const wanted = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  );
  const result = await authedFetch<CalibrationView>(
    'tenant',
    `/tenant/performance/cycles/${id}/calibration${wanted.size ? `?${wanted}` : ''}`,
  );
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const view = result.data;
  const t = await getTranslations('reviews');
  const format = await getFormatter();
  const locale = await getLocale();
  const select = (
    name: keyof typeof filters,
    label: string,
    options: { id: string; label: string }[],
  ) =>
    options.length > 1 && (
      <select
        name={name}
        defaultValue={filters[name]}
        aria-label={label}
        className={`${inputClass} w-auto`}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );

  return (
    <>
      <div className="space-y-1">
        <Link
          href={`/workspace/performance/cycles/${id}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {view.cycle.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t('calibration.title')}</h1>
          <CycleStatusBadge status={view.cycle.status} />
        </div>
        <p className="text-sm text-slate-600">{t('calibration.intro')}</p>
      </div>
      {(view.missing.managerReviews > 0 || view.missing.finalRatings > 0) && (
        <Banner tone="amber">
          {[
            view.missing.managerReviews > 0 &&
              t('calibration.missingManager', {
                count: view.missing.managerReviews,
                n: format.number(view.missing.managerReviews),
              }),
            view.missing.finalRatings > 0 &&
              t('calibration.missingFinal', {
                count: view.missing.finalRatings,
                n: format.number(view.missing.finalRatings),
              }),
          ]
            .filter(Boolean)
            .join(' ')}
        </Banner>
      )}

      <form className="flex flex-wrap items-center gap-2">
        {select(
          'legalEntityId',
          t('calibration.allCompanies'),
          view.filters.legalEntities.map((e) => ({ id: e.id, label: e.name })),
        )}
        {select(
          'orgUnitId',
          t('calibration.allUnits'),
          view.filters.orgUnits.map((u) => ({ id: u.id, label: u.name })),
        )}
        {select(
          'managerEmployeeId',
          t('calibration.allManagers'),
          view.filters.managers.map((m) => ({ id: m.id, label: personName(m, locale) })),
        )}
        <button className={buttonClass.secondary}>{t('calibration.show')}</button>
      </form>

      <Card title={t('calibration.distribution')}>
        <DistributionChart proposed={view.distribution.proposed} final={view.distribution.final} />
      </Card>

      <Card title={t('calibration.people', { n: format.number(view.people.length) })}>
        {view.people.length === 0 ? (
          <p className="text-sm text-slate-500">{t('cycle.nobody')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('calibration.person')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('review.goalScore')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('calibration.proposed')}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('form.recommendations')}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t('calibration.final')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {view.people.map((p) => (
                  <tr key={p.reviewId}>
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/workspace/performance/reviews/${p.reviewId}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {personName(p.employee, locale)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {[
                          p.employee.employeeCode,
                          p.designation,
                          p.orgUnit?.name,
                          p.manager && t('review.manager', { name: personName(p.manager, locale) }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <div className="mt-1">
                        <ReviewStatusBadge status={p.status} />
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {p.goalScore === null ? '–' : format.number(Number(p.goalScore))}
                    </td>
                    <td className="py-2.5 pr-3">
                      <RatingText rating={p.proposedRating} />
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.recommendations ? (
                        <ul className="flex flex-wrap gap-1">
                          {p.recommendations.increment && (
                            <li>
                              <Badge tone="green">{t('form.increment')}</Badge>
                            </li>
                          )}
                          {p.recommendations.promotion && (
                            <li>
                              <Badge tone="blue">
                                {t('review.promotionTo', {
                                  designation: p.recommendations.promotion.name,
                                })}
                              </Badge>
                            </li>
                          )}
                          {p.recommendations.plan && (
                            <li>
                              <Badge tone="amber">{t('form.plan')}</Badge>
                            </li>
                          )}
                        </ul>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="py-2.5">
                      {view.canChange ? (
                        <FinalRatingForm row={p} />
                      ) : (
                        <RatingText rating={p.finalRating} />
                      )}
                      {p.calibratedAt && (
                        <p className="mt-1 text-xs text-slate-500">
                          {t('review.calibratedBy', {
                            name: p.calibratedBy ?? '–',
                            date: format.dateTime(new Date(p.calibratedAt), {
                              dateStyle: 'medium',
                              timeZone: 'Asia/Dhaka',
                            }),
                          })}
                        </p>
                      )}
                      {p.calibrationNote && !view.canChange && (
                        <p className="mt-1 text-xs text-slate-600">“{p.calibrationNote}”</p>
                      )}
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
