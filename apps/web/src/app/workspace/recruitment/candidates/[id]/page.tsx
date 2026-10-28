import { can, type CandidateDetail } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CandidateEditForm, EraseCandidate } from '@/components/recruitment/candidate-forms';
import { dhakaFormat, StageBadge } from '@/components/recruitment/pipeline-views';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';

/** One candidate: their details, CV and applications; corrected or erased on request. */
export default async function CandidatePage({
  params,
}: PageProps<'/workspace/recruitment/candidates/[id]'>) {
  if (!can((await currentTenantUser())?.role, 'recruitment.manage')) redirect('/workspace');
  const { id } = await params;
  const t = await getTranslations('pipeline');
  const format = await getFormatter();
  const locale = await getLocale();
  const { day, time } = await dhakaFormat();
  const result = await authedFetch<CandidateDetail>(
    'tenant',
    `/tenant/recruitment/candidates/${id}`,
  );
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const c = result.data;
  const referrer = c.referredBy;

  return (
    <>
      <div className="space-y-1">
        <Link
          href="/workspace/recruitment/candidates"
          className="text-sm text-slate-500 hover:underline"
        >
          ← {t('candidate.back')}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {c.erasedAt ? t('erasedName') : c.fullName}
          {c.talentPool && <Badge tone="green">{t('list.inPool')}</Badge>}
        </h1>
        <p className="text-sm text-slate-600">
          {t(`sources.${c.source}`)}
          {referrer &&
            ` · ${t('candidate.referredBy', {
              name:
                locale === 'bn' && referrer.fullNameBn ? referrer.fullNameBn : referrer.fullName,
            })}`}
        </p>
      </div>

      {c.erasedAt && (
        <Banner tone="slate">{t('candidate.erased', { date: day(c.erasedAt) })}</Banner>
      )}

      <Card title={t('candidate.applications')}>
        <ul className="divide-y divide-slate-100 text-sm">
          {c.applications.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <Link
                  href={`/workspace/recruitment/applications/${a.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {a.opening.title}
                </Link>
                <span className="block text-xs text-slate-500">
                  {t(`sources.${a.source}`)} · {t('board.applied', { date: day(a.appliedAt) })}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <StageBadge stage={a.stage} />
                <Link
                  href={`/workspace/recruitment/openings/${a.opening.id}/pipeline`}
                  className="text-brand-700 hover:underline"
                >
                  {t('candidate.pipeline')}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {!c.erasedAt && (
        <>
          <Card title={t('candidate.details')}>
            <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t('candidate.cv')}</dt>
                <dd>
                  {c.cv ? (
                    <a
                      href={`/workspace/files/recruitment/candidates/${c.id}/cv`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t('candidate.downloadCv', {
                        name: c.cv.fileName,
                        size: format.number(c.cv.sizeBytes / 1024, { maximumFractionDigits: 0 }),
                      })}
                    </a>
                  ) : (
                    t('candidate.noCv')
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('candidate.consentLabel')}</dt>
                <dd>
                  {c.consentAt
                    ? t('candidate.consent', { date: time(c.consentAt) })
                    : t('candidate.noConsent')}
                </dd>
              </div>
            </dl>
            <CandidateEditForm key={c.updatedAt} candidate={c} />
          </Card>

          <Card title={t('candidate.erase.title')}>
            {c.hired ? (
              <p className="text-sm text-slate-600">{t('candidate.hired')}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">{t('candidate.erase.intro')}</p>
                <EraseCandidate candidate={c} />
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
