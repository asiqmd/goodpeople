import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { EngagementMe } from '@gp/shared';
import { RecognitionForm, ReasonAction } from '@/components/employee-services/forms';
import { ServiceHead } from '@/components/employee-services/views';
import { Banner, Card } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function RecognitionPage() {
  const me = await serviceData<EngagementMe>('/engagement/me'),
    t = await getTranslations('services'),
    locale = await getLocale(),
    f = await getFormatter();
  return (
    <>
      <ServiceHead area="engagement" />
      {me.employee ? (
        <Card title={t('newRecognition')}>
          <RecognitionForm />
        </Card>
      ) : (
        <Banner tone="amber">{t('noEmployee')}</Banner>
      )}
      {!me.recognition.length && <p>{t('empty')}</p>}
      {me.recognition.map((r) => (
        <Card
          key={r.id}
          title={`${locale === 'bn' ? (r.recipient.fullNameBn ?? r.recipient.fullName) : r.recipient.fullName} · ${t(`values.${r.value}`)}`}
        >
          <p className="text-sm text-slate-600">
            {t('from')}: {r.sender.fullName} · {r.company.name} ·{' '}
            {f.dateTime(new Date(r.createdAt), { dateStyle: 'medium', timeZone: 'Asia/Dhaka' })}
          </p>
          <p className="my-4 whitespace-pre-wrap">{r.message}</p>
          {r.canHide && (
            <details>
              <summary className="cursor-pointer text-sm text-slate-600">
                {t('withdrawRecognition')}
              </summary>
              <ReasonAction kind="hideRecognition" id={r.id} label={t('withdrawRecognition')} />
            </details>
          )}
        </Card>
      ))}
    </>
  );
}
