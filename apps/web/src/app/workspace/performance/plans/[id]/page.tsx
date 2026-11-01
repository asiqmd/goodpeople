import { todayIn, type PerformanceRecord, type PlanView } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PlanAcknowledgeForm,
  PlanCheckinForm,
  PlanCloseForm,
  PlanDraftButtons,
  PlanEditor,
  PlanExtendForm,
} from '@/components/performance/plan-forms';
import {
  dhakaDay,
  isRunning,
  nameOf,
  PlanLawNote,
  PlanStatusBadge,
} from '@/components/performance/plan-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/**
 * One improvement plan. Its manager or HR changes the draft, starts it, holds check-ins,
 * extends and closes it; the person reads it once started and acknowledges it. The page says
 * what the plan can and cannot do in law.
 */
export default async function PlanPage({ params }: PageProps<'/workspace/performance/plans/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('development.plan');
  const ts = await getTranslations('development.plans');
  const locale = await getLocale();
  const day = await dhakaDay();
  const result = await authedFetch<PlanView>('tenant', `/tenant/performance/plans/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const plan = result.data;
  const today = todayIn();
  const reviews = plan.can.edit ? await reviewsOf(plan.employee.id) : [];
  const closed = plan.status !== 'draft' && !isRunning(plan.status);

  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/performance/plans"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {ts('title')}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {plan.mine ? t('yourTitle') : t('title', { name: nameOf(plan.employee, locale) })}
          <PlanStatusBadge status={plan.status} />
        </h1>
        <p className="text-sm text-slate-600">
          {ts('period', { start: day(plan.startsOn), end: day(plan.endsOn) })}
          {[plan.designation, plan.orgUnit].filter(Boolean).map((s) => ` · ${s}`)}
        </p>
      </div>

      <PlanLawNote />
      {plan.can.acknowledge && <Banner tone="amber">{t('pleaseAcknowledge')}</Banner>}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title={t('reason')}>
            <p className="text-sm whitespace-pre-line text-slate-800">{plan.reason}</p>
          </Card>
          <Card title={t('objectives')}>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {plan.objectives.map((o, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-900">{o.text}</span>
                  <span className="block text-slate-600">
                    {t('measuredBy', { measure: o.measure })}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title={t('support')}>
            <p className="text-sm whitespace-pre-line text-slate-800">
              {plan.support ?? t('noSupport')}
            </p>
          </Card>
          <Card title={t('checkins')}>
            <div className="space-y-4">
              {plan.checkins.length === 0 ? (
                <p className="text-sm text-slate-500">{t('noCheckins')}</p>
              ) : (
                <ul className="-mx-5 divide-y divide-slate-100 text-sm">
                  {plan.checkins.map((c) => (
                    <li key={c.id} className="px-5 py-3">
                      <span className="text-xs text-slate-500">
                        {day(c.heldOn)}
                        {c.author && ` · ${c.author}`}
                      </span>
                      <p className="whitespace-pre-line text-slate-800">{c.note}</p>
                    </li>
                  ))}
                </ul>
              )}
              {plan.can.checkin && (
                <PlanCheckinForm planId={plan.id} startsOn={plan.startsOn} today={today} />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t('details')}>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">{t('manager')}</dt>
                <dd>{plan.manager ? nameOf(plan.manager, locale) : ts('noManager')}</dd>
              </div>
              {plan.review && (
                <div>
                  <dt className="text-slate-500">{t('fromReview')}</dt>
                  <dd>
                    <Link
                      href={`/workspace/performance/reviews/${plan.review.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {plan.review.cycleName}
                    </Link>
                  </dd>
                </div>
              )}
              {plan.extensions.length > 0 && (
                <div>
                  <dt className="text-slate-500">{t('extensions')}</dt>
                  {plan.extensions.map((e) => (
                    <dd key={e.at}>
                      {t('extendedFrom', { from: day(e.from), to: day(e.to) })}
                      {e.reason && <span className="block text-xs text-slate-500">{e.reason}</span>}
                    </dd>
                  ))}
                </div>
              )}
              {plan.createdBy && (
                <div>
                  <dt className="text-slate-500">{t('createdBy')}</dt>
                  <dd>{t('createdOn', { name: plan.createdBy, date: day(plan.createdAt) })}</dd>
                </div>
              )}
            </dl>
          </Card>

          {plan.status === 'draft' && plan.role === 'manage' && (
            <Card title={t('draft')}>
              <p className="mb-3 text-sm text-slate-600">{t('draftHint')}</p>
              <div className="space-y-4">
                <PlanDraftButtons planId={plan.id} />
                <PlanEditor plan={plan} reviews={reviews} today={today} />
              </div>
            </Card>
          )}

          {closed && (
            <Card title={t('outcomeTitle')}>
              <p className="text-sm">
                <PlanStatusBadge status={plan.status} />
                {plan.decidedAt && (
                  <span className="ml-2 text-slate-500">{day(plan.decidedAt)}</span>
                )}
              </p>
              {plan.outcomeNote && (
                <p className="mt-2 text-sm whitespace-pre-line text-slate-800">
                  {plan.outcomeNote}
                </p>
              )}
              {plan.status === 'not_met' && (
                <p className="mt-3 text-xs text-slate-500">{t('notMetIsRecord')}</p>
              )}
            </Card>
          )}

          {plan.status !== 'draft' && (
            <Card title={t('acknowledgement')}>
              {plan.acknowledgedAt ? (
                <div className="space-y-2 text-sm">
                  <p className="text-slate-600">
                    {t('acknowledgedOn', { date: day(plan.acknowledgedAt) })}
                  </p>
                  {plan.employeeComment && (
                    <blockquote className="border-l-2 border-slate-200 pl-3 whitespace-pre-line text-slate-800">
                      {plan.employeeComment}
                    </blockquote>
                  )}
                </div>
              ) : plan.can.acknowledge ? (
                <PlanAcknowledgeForm planId={plan.id} />
              ) : (
                <p className="text-sm text-slate-500">{ts('notAcknowledged')}</p>
              )}
            </Card>
          )}

          {plan.can.extend && (
            <Card title={t('extendTitle')}>
              <PlanExtendForm planId={plan.id} endsOn={plan.endsOn} />
            </Card>
          )}
          {plan.can.close && (
            <Card title={t('closeTitle')}>
              <PlanCloseForm planId={plan.id} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/** The person's reviews, for saying which one recommended a draft. */
async function reviewsOf(employeeId: string) {
  const result = await authedFetch<PerformanceRecord>(
    'tenant',
    `/tenant/employees/${employeeId}/performance`,
  );
  return result.ok ? result.data.reviews.map((r) => ({ id: r.id, label: r.cycle.name })) : [];
}
