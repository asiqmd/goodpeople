import Link from 'next/link';
import { getLocale, getTranslations, getFormatter } from 'next-intl/server';
import type { AssetIssueView, HrRequestView } from '@gp/shared';
import { Banner, buttonClass, Card } from '@/components/ui';
import { HelpLink } from '@/components/help/help-link';
import { day } from '@/components/leave/leave-views';
import { ServiceForm } from './forms';
export async function ServiceHead({
  area,
  manage = false,
  title,
}: {
  area: 'engagement' | 'services';
  manage?: boolean;
  title?: string;
}) {
  const t = await getTranslations('services');
  const routes =
    area === 'engagement'
      ? ['announcements', 'surveys', 'recognition']
      : ['requests', 'assets', ...(manage ? ['inventory'] : [])];
  return (
    <>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{title ?? t(area)}</h1>
        <nav className="flex flex-wrap gap-2">
          {routes.map((route) => (
            <Link
              className={buttonClass.secondary}
              key={route}
              href={`/workspace/${area === 'engagement' ? area : 'employee-services'}/${route === 'inventory' ? 'assets/manage' : route}`}
            >
              {t(route)}
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-sm text-slate-600">
        {t(area === 'engagement' ? 'introEngagement' : 'introServices')}{' '}
        <HelpLink slug="employee-services" />
      </p>
    </>
  );
}
export async function ServiceError({ message }: { message: string }) {
  return <Banner tone="amber">{message}</Banner>;
}
export async function RequestList({ requests }: { requests: HrRequestView[] }) {
  const t = await getTranslations('services'),
    f = await getFormatter();
  return !requests.length ? (
    <p>{t('empty')}</p>
  ) : (
    <ul className="divide-y divide-slate-100">
      {requests.map((r) => (
        <li className="space-y-1 py-3" key={r.id}>
          <Link
            className="font-medium text-brand-700 hover:underline"
            href={`/workspace/employee-services/requests/${r.id}`}
          >
            {r.subject}
          </Link>
          <p className="text-sm text-slate-600">
            {r.employee.fullName} · {r.company.name} · {t(`categories.${r.category}`)} ·{' '}
            {t(`priorities.${r.priority}`)} · {t(`states.${r.status}`)} ·{' '}
            {f.dateTime(new Date(r.updatedAt), { dateStyle: 'medium', timeZone: 'Asia/Dhaka' })}
          </p>
        </li>
      ))}
    </ul>
  );
}
export async function IssueCards({
  issues,
  hr = false,
}: {
  issues: AssetIssueView[];
  hr?: boolean;
}) {
  const t = await getTranslations('services'),
    locale = await getLocale(),
    f = await getFormatter();
  return !issues.length ? (
    <p>{t('empty')}</p>
  ) : (
    <div className="space-y-4">
      {issues.map((r) => (
        <Card
          key={r.id}
          title={`${r.asset.tag} · ${locale === 'bn' ? r.asset.nameBn : r.asset.name}`}
        >
          <p>
            {r.employee.fullName} · {r.company.name}
          </p>
          <p className="text-sm">
            {r.asset.serialNumber} · {t(`kinds.${r.asset.kind}`)}
          </p>
          <p>
            {t('issuedOn')}: {day(f, r.issuedOn)}
            {r.dueOn && (
              <>
                {' '}
                · {t('dueOn')}: {day(f, r.dueOn)}
              </>
            )}
            {r.overdue && <span className="ms-2 text-red-700">{t('overdue')}</span>}
          </p>
          <p className="whitespace-pre-wrap text-sm">
            {t('issueCondition')}: {r.issueCondition}
          </p>
          {r.returnedOn && (
            <>
              <p>
                {t('returnedOn')}: {day(f, r.returnedOn)}
              </p>
              <p className="whitespace-pre-wrap text-sm">
                {t('returnCondition')}: {r.returnCondition}
              </p>
            </>
          )}
          <p className="text-sm">{r.acknowledgedAt ? t('acknowledged') : t('pending')}</p>
          {r.canAcknowledge && (
            <ServiceForm kind="acknowledgeAsset" id={r.id} label={t('acknowledgeAsset')} />
          )}{' '}
          {hr && (
            <Link
              href={`/workspace/employee-services/assets/${r.asset.id}`}
              className="text-brand-700 hover:underline"
            >
              {t('history')}
            </Link>
          )}
        </Card>
      ))}
    </div>
  );
}
