import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { SurveyView } from '@gp/shared';
import {
  ReasonAction,
  ServiceForm,
  SurveyForm,
  SurveyResponseForm,
} from '@/components/employee-services/forms';
import { ServiceHead } from '@/components/employee-services/views';
import { Banner, Card } from '@/components/ui';
import { serviceData, serviceOrg } from '@/lib/employee-services';
export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    s = await serviceData<SurveyView>(`/engagement/surveys/${id}`),
    t = await getTranslations('services'),
    locale = await getLocale(),
    f = await getFormatter();
  return (
    <>
      <ServiceHead area="engagement" title={locale === 'bn' ? s.titleBn : s.title} />
      <Card>
        <p>
          {s.company.name} · {t(`states.${s.status}`)} ·{' '}
          {f.dateTime(new Date(s.closesAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Dhaka',
          })}
        </p>
        <p className="my-4 whitespace-pre-wrap">
          {locale === 'bn' ? s.descriptionBn : s.description}
        </p>
        {s.submitted ? (
          <Banner tone="green">{t('alreadyResponded')}</Banner>
        ) : s.status === 'closed' ? (
          <p>{t('closed')}</p>
        ) : s.eligible && s.status === 'open' ? (
          <SurveyResponseForm survey={s} bangla={locale === 'bn'} />
        ) : (
          <p>{t('cohortNote')}</p>
        )}
      </Card>
      {s.manage && s.status === 'draft' && (
        <>
          <Card title={t('editDraft')}>
            <SurveyForm org={await serviceOrg('engagement.manage')} initial={s} />
          </Card>
          <Card>
            <ServiceForm kind="publishSurvey" id={id} label={t('publish')} />
          </Card>
        </>
      )}
      {s.manage && s.status === 'open' && (
        <Card title={t('closeSurvey')}>
          <ReasonAction kind="closeSurvey" id={id} label={t('closeSurvey')} />
        </Card>
      )}
      {s.results && (
        <Card title={t('results')}>
          {s.results.suppressed ? (
            <Banner tone="amber">{t('resultsProtected', { minimum: s.results.minimum })}</Banner>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(
                  ['enps', 'responses', 'eligible', 'promoters', 'passives', 'detractors'] as const
                ).map((key) => (
                  <div key={key}>
                    <dt className="text-sm text-slate-500">{t(key)}</dt>
                    <dd className="text-xl font-semibold">
                      {f.number(
                        (
                          s.results as Exclude<
                            NonNullable<SurveyView['results']>,
                            { suppressed: true }
                          >
                        )[key],
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {s.results.questions.map((q, i) => (
                <div className="mt-5 border-t pt-3" key={i}>
                  <h3 className="font-medium">
                    {locale === 'bn' ? s.questions[i]!.textBn : s.questions[i]!.text}
                  </h3>
                  <p>
                    {t('mean')}: {f.number(q.mean)}
                  </p>
                  <p>
                    {t('distribution')}: {q.distribution.map((v) => f.number(v)).join(' · ')}
                  </p>
                </div>
              ))}
            </>
          )}
        </Card>
      )}
    </>
  );
}
