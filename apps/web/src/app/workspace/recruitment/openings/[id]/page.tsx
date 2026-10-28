import {
  can,
  todayIn,
  type OpeningDetail,
  type RecruitmentSettingsView,
  type TenantAccessView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { day } from '@/components/leave/leave-views';
import { openingChoices } from '@/components/recruitment/opening-choices';
import { plainDescription, siteOrigin } from '@/components/recruitment/opening-copy';
import {
  CopyText,
  OpeningForm,
  OpeningMoveButton,
  PostEditor,
} from '@/components/recruitment/opening-forms';
import {
  ApprovalTrail,
  OpeningStatusBadge,
  payRange,
  personName,
  postTitle,
  StageCounts,
} from '@/components/recruitment/opening-views';
import { Banner, Card } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';
import { Markdown } from '@/lib/help/markdown';

const MOVES = ['submit', 'publish', 'reopen', 'close', 'cancel'] as const;

const settingsLink = (chunks: ReactNode) => (
  <Link href="/workspace/recruitment/settings" className="font-medium underline">
    {chunks}
  </Link>
);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 text-slate-900">{children}</dd>
    </div>
  );
}

/** The post as plain text in one language, for bdjobs, LinkedIn and other boards. */
async function boardText(o: OpeningDetail, language: 'en' | 'bn', link: string) {
  const t = await getTranslations({ locale: language, namespace: 'openings.copy' });
  const types = await getTranslations({ locale: language, namespace: 'hr.employmentTypes' });
  const format = await getFormatter({ locale: language });
  const title = language === 'en' ? o.postTitleEn : o.postTitleBn;
  const description = language === 'en' ? o.descriptionEn : o.descriptionBn;
  if (!title || !description) return null;
  const salary = o.showSalary ? payRange(format, o.budgetMin, o.budgetMax) : null;
  return [
    title,
    [o.legalEntity.name, o.location?.name].filter(Boolean).join(' · '),
    types(o.employmentType),
    ...(salary ? [t('salary', { salary })] : []),
    '',
    plainDescription(description),
    '',
    o.closesOn ? t('applyBy', { date: day(format, o.closesOn), link }) : t('apply', { link }),
  ].join('\n');
}

/** One opening: its details and approval, the job post and publishing, and its applications. */
export default async function OpeningPage({
  params,
}: PageProps<'/workspace/recruitment/openings/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('openings');
  const th = await getTranslations('hr.employmentTypes');
  const format = await getFormatter();
  const locale = await getLocale();
  const found = await authedFetch<OpeningDetail>('tenant', `/tenant/recruitment/openings/${id}`);
  if (!found.ok) {
    if (found.status === 404 || found.status === 400) notFound();
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Banner tone="amber">
          {found.error.code === 'feature_not_in_plan' ? t('notInPlan') : found.error.message}
        </Banner>
      </>
    );
  }
  const o = found.data;
  const manage = can((await currentTenantUser())?.role, 'recruitment.manage');
  const allowed = (action: OpeningDetail['actions'][number]) => o.actions.includes(action);
  const [choices, access, settings] = await Promise.all([
    allowed('edit') ? openingChoices(manage) : null,
    load<TenantAccessView>('tenant', '/tenant/access'),
    manage ? load<RecruitmentSettingsView>('tenant', '/tenant/recruitment/settings') : null,
  ]);
  const publicLink = `${await siteOrigin()}/careers/${access.tenant.slug}/${o.id}`;
  const budget = payRange(format, o.budgetMin, o.budgetMax);
  const posted = o.publishedAt !== null;
  // The copy carries the careers link, which works while the job is open.
  const texts =
    o.status === 'open'
      ? (
          await Promise.all(
            (['en', 'bn'] as const).map(async (l) => ({
              l,
              text: await boardText(o, l, publicLink),
            })),
          )
        ).filter((x): x is { l: 'en' | 'bn'; text: string } => x.text !== null)
      : [];
  const title = postTitle(o, locale);
  const description =
    (locale === 'bn'
      ? (o.descriptionBn ?? o.descriptionEn)
      : (o.descriptionEn ?? o.descriptionBn)) ?? '';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/workspace/recruitment" className="text-sm text-slate-500 hover:underline">
            ← {t('title')}
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
            {o.title} <OpeningStatusBadge status={o.status} />
          </h1>
          {title && title !== o.title && <p className="text-slate-600">{title}</p>}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {MOVES.filter(allowed).map((move) => (
            <OpeningMoveButton
              key={move}
              id={o.id}
              move={move}
              primary={move === 'submit' || move === 'publish' || move === 'reopen'}
            />
          ))}
        </div>
      </div>

      {o.status === 'open' && (
        <Banner tone="green">
          {t('detail.live')}{' '}
          <a href={publicLink} target="_blank" rel="noopener" className="font-medium underline">
            {publicLink}
          </a>
          {settings && !settings.careersEnabled && (
            <> {t.rich('detail.careersOff', { link: settingsLink })}</>
          )}
        </Banner>
      )}
      {o.status === 'rejected' && <Banner tone="red">{t('detail.rejected')}</Banner>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t('detail.details')} className="lg:col-span-2">
          <dl className="divide-y divide-slate-100">
            <Row label={t('form.company')}>{o.legalEntity.name}</Row>
            {o.orgUnit && <Row label={t('form.unit')}>{o.orgUnit.name}</Row>}
            {o.location && <Row label={t('form.location')}>{o.location.name}</Row>}
            {o.designation && <Row label={t('form.designation')}>{o.designation.name}</Row>}
            {o.grade && <Row label={t('form.grade')}>{o.grade.name}</Row>}
            <Row label={t('form.employmentType')}>{th(o.employmentType)}</Row>
            <Row label={t('form.headcount')}>{format.number(o.headcount)}</Row>
            <Row label={t('form.reason')}>
              {t(`form.reasons.${o.reason}`)}
              {o.replaces && ` · ${personName(o.replaces, locale)}`}
            </Row>
            <Row label={t('detail.budget')}>{budget ?? t('detail.noBudget')}</Row>
            <Row label={t('form.hiringManager')}>
              {o.hiringManager ? personName(o.hiringManager, locale) : t('detail.noManager')}
            </Row>
            {o.justification && (
              <Row label={t('form.justification')}>
                <span className="whitespace-pre-line">{o.justification}</span>
              </Row>
            )}
            <Row label={t('form.criteria')}>{o.scorecardCriteria.join(' · ')}</Row>
            {o.createdBy && (
              <Row label={t('detail.drafted')}>
                {t('detail.draftedBy', {
                  name: o.createdBy.name,
                  date: format.dateTime(new Date(o.createdAt), {
                    dateStyle: 'medium',
                    timeZone: 'Asia/Dhaka',
                  }),
                })}
              </Row>
            )}
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title={t('detail.approval')}>
            <ApprovalTrail steps={o.steps} />
          </Card>
          <Card title={t('detail.applications')}>
            <p className="mb-2 text-sm text-slate-700">
              {t('list.applications', { count: o.applications })}
            </p>
            <StageCounts
              counts={o.counts}
              href={`/workspace/recruitment/openings/${o.id}/pipeline`}
            />
            <p className="mt-3 text-sm">
              <Link
                href={`/workspace/recruitment/openings/${o.id}/pipeline`}
                className="font-medium text-brand-700 hover:underline"
              >
                {t('detail.pipeline')}
              </Link>
            </p>
          </Card>
        </div>
      </div>

      {allowed('edit') && choices && (
        <Card title={t('detail.edit')}>
          <OpeningForm opening={o} {...choices} />
        </Card>
      )}

      {allowed('post') ? (
        <Card title={t('detail.post')}>
          <PostEditor opening={o} today={todayIn()} budget={budget} />
        </Card>
      ) : (
        posted &&
        description && (
          <Card title={t('detail.post')}>
            <h2 className="mb-3 text-lg font-semibold">{title}</h2>
            <Markdown source={description} />
          </Card>
        )
      )}

      {texts.length > 0 && (
        <Card title={t('copy.title')}>
          <p className="mb-4 text-sm text-slate-600">{t('copy.intro')}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            {texts.map(({ l, text }) => (
              <CopyText key={l} label={t(`post.languages.${l}`)} text={text} />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
