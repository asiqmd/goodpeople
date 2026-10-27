import { ticketLabel, type PlatformSupportGrantView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EndSessionButton, OpenWorkspaceButton } from '@/components/support/access-forms';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

/** Workspaces that have let support in right now, to open read-only. */
export default async function SupportAccessConsolePage() {
  const t = await getTranslations('supportAccess.console');
  const result = await authedFetch<PlatformSupportGrantView[]>(
    'platform',
    '/platform/support/access',
  );
  if (!result.ok) {
    return (
      <Banner tone={result.status === 403 ? 'slate' : 'red'}>
        {result.status === 403 ? t('notAllowed') : result.error.message}
      </Banner>
    );
  }
  const format = await getFormatter();
  const clock = await clockOptions();
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...clock,
      timeZone: 'Asia/Dhaka',
    });
  const grants = result.data;

  return (
    <Card title={t('title')}>
      <p className="mb-4 text-sm text-slate-600">{t('intro')}</p>
      {grants.length === 0 ? (
        <p className="text-sm text-slate-500">{t('none')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">{t('workspace')}</th>
                <th className="px-5 py-2 font-medium">{t('grantedBy')}</th>
                <th className="px-5 py-2 font-medium">{t('until')}</th>
                <th className="px-5 py-2 font-medium">{t('about')}</th>
                <th className="px-5 py-2 font-medium">{t('sessions')}</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grants.map((grant) => (
                <tr key={grant.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link
                      href={`/platform/tenants/${grant.tenant.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {grant.tenant.name}
                    </Link>
                    <span className="block font-mono text-xs text-slate-500">
                      {grant.tenant.slug}
                    </span>
                  </td>
                  <td className="px-5 py-3">{grant.grantedBy.name}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{when(grant.endsAt)}</td>
                  <td className="px-5 py-3">
                    {grant.ticketId && grant.ticketNumber && (
                      <Link
                        href={`/platform/support/${grant.ticketId}`}
                        className="mr-1 font-medium text-brand-700 hover:underline"
                      >
                        {ticketLabel(grant.ticketNumber)}
                      </Link>
                    )}
                    <span className="text-slate-600">{grant.note}</span>
                  </td>
                  <td className="px-5 py-3">
                    <ul className="space-y-1">
                      {grant.openSessions.map((s) => (
                        <li key={s.id}>
                          {t('session', { name: s.platformUserName, since: when(s.startedAt) })}{' '}
                          <EndSessionButton sessionId={s.id} />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <OpenWorkspaceButton tenantId={grant.tenant.id} grantId={grant.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
