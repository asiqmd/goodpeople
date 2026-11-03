import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { AnnouncementView } from '@gp/shared';
import { AnnouncementForm, ReasonAction, ServiceForm } from '@/components/employee-services/forms';
import { ServiceHead } from '@/components/employee-services/views';
import { Banner, Card } from '@/components/ui';
import { day } from '@/components/leave/leave-views';
import { serviceData, serviceOrg } from '@/lib/employee-services';
export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    a = await serviceData<AnnouncementView>(`/engagement/announcements/${id}`),
    t = await getTranslations('services'),
    locale = await getLocale(),
    f = await getFormatter();
  return (
    <>
      <ServiceHead area="engagement" title={locale === 'bn' ? a.titleBn : a.title} />
      <Card>
        <p>
          {a.company.name} · {t(`states.${a.status}`)}
          {a.expired && <> · {t('expired')}</>}
        </p>
        <div className="my-5 whitespace-pre-wrap">{locale === 'bn' ? a.bodyBn : a.body}</div>
        {a.dueOn && (
          <p>
            {t('dueOn')}: {day(f, a.dueOn)}
          </p>
        )}
        {a.requiresAcknowledgement && (
          <p className="my-3 text-sm text-slate-600">{t('policyNote')}</p>
        )}
        {a.acknowledgedAt && (
          <Banner tone="green">
            {t('acknowledged')} ·{' '}
            {f.dateTime(new Date(a.acknowledgedAt), {
              dateStyle: 'medium',
              timeZone: 'Asia/Dhaka',
            })}
          </Banner>
        )}
        {a.canAcknowledge && <ServiceForm kind="acknowledge" id={id} label={t('acknowledge')} />}
      </Card>
      {a.manage && a.status === 'draft' && (
        <>
          <Card title={t('editDraft')}>
            <AnnouncementForm org={await serviceOrg('engagement.manage')} initial={a} />
          </Card>
          <Card>
            <ServiceForm kind="publishAnnouncement" id={id} label={t('publish')} />
          </Card>
        </>
      )}
      {a.manage && a.status !== 'retired' && (
        <Card title={t('retire')}>
          <p className="mb-3 text-sm">{t('fixed')}</p>
          <ReasonAction kind="retireAnnouncement" id={id} label={t('retire')} />
        </Card>
      )}
      {a.receipts && (
        <Card title={t('receipts')}>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr>
                  <th className="p-2">{t('employee')}</th>
                  <th className="p-2">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {a.receipts.map((r) => (
                  <tr key={r.employee.id} className="border-t">
                    <td className="p-2">
                      {r.employee.employeeCode} ·{' '}
                      {locale === 'bn'
                        ? (r.employee.fullNameBn ?? r.employee.fullName)
                        : r.employee.fullName}
                    </td>
                    <td className="p-2">
                      {r.acknowledgedAt
                        ? `${t('acknowledged')} · ${f.dateTime(new Date(r.acknowledgedAt), { dateStyle: 'medium', timeZone: 'Asia/Dhaka' })}`
                        : t('outstanding')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
