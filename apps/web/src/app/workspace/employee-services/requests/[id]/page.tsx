import { getFormatter, getTranslations } from 'next-intl/server';
import type { EmployeeServicesMe, HrRequestView, Ref } from '@gp/shared';
import {
  OwnerRequestAction,
  RequestReplyForm,
  RequestUpdateForm,
} from '@/components/employee-services/forms';
import { ServiceHead } from '@/components/employee-services/views';
import { Banner, Card } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    r = await serviceData<HrRequestView>(`/employee-services/requests/${id}`),
    me = await serviceData<EmployeeServicesMe>('/employee-services/me'),
    t = await getTranslations('services'),
    f = await getFormatter();
  const handlers = r.manage
    ? await serviceData<Ref[]>(`/employee-services/requests/${id}/handlers`)
    : [];
  const own = me.employee?.id === r.employee.id;
  return (
    <>
      <ServiceHead area="services" manage={me.manage} title={r.subject} />
      <Card>
        <p>
          {r.employee.employeeCode} · {r.employee.fullName} · {r.company.name}
        </p>
        <p>
          {t(`categories.${r.category}`)} · {t(`priorities.${r.priority}`)} ·{' '}
          {t(`states.${r.status}`)}
        </p>
        <p>
          {t('assignee')}: {r.assignee?.name ?? t('unassigned')}
        </p>
        <p className="mt-3 text-sm text-slate-600">{t('requestPrivacy')}</p>
      </Card>
      {r.messages.map((m) => (
        <Card key={m.id}>
          <p className="text-sm text-slate-600">
            {m.authorName} ·{' '}
            {f.dateTime(new Date(m.createdAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Dhaka',
            })}
          </p>
          {m.internal && <Banner tone="amber">{t('internalLabel')}</Banner>}
          <p className="mt-3 whitespace-pre-wrap">{m.body}</p>
        </Card>
      ))}
      {r.status !== 'closed' ? (
        <Card title={t('reply')}>
          <RequestReplyForm id={id} manage={r.manage} />
        </Card>
      ) : (
        <Banner tone="amber">{t('requestClosed')}</Banner>
      )}
      {r.manage && r.status !== 'closed' && (
        <Card title={t('updateRequest')}>
          <RequestUpdateForm request={r} handlers={handlers} />
        </Card>
      )}
      {own && ['resolved', 'closed'].includes(r.status) && (
        <Card>
          {r.status === 'resolved' && <OwnerRequestAction id={id} status="closed" />}
          <div className="mt-4">
            <OwnerRequestAction id={id} status="open" />
          </div>
        </Card>
      )}
    </>
  );
}
