import { ticketLabel, type PlatformSupportGrantView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/api';
import { Card } from '@/components/ui';
import { clockOptions } from '@/lib/clock';
import { OpenWorkspaceButton } from './access-forms';

/** On a workspace's console page: whether it has let support in, and the way in if so. */
export async function SupportAccessCard({ tenantId }: { tenantId: string }) {
  const result = await authedFetch<PlatformSupportGrantView[]>(
    'platform',
    '/platform/support/access',
  );
  // Roles that cannot see support access do not get the card.
  if (!result.ok) return null;
  const t = await getTranslations('supportAccess.console');
  const format = await getFormatter();
  const clock = await clockOptions();
  const grants = result.data.filter((grant) => grant.tenantId === tenantId);
  return (
    <Card title={t('cardTitle')}>
      {grants.length === 0 ? (
        <p className="text-sm text-slate-500">{t('cardNone')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {grants.map((grant) => (
            <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                {t('cardGrant', {
                  name: grant.grantedBy.name,
                  until: format.dateTime(new Date(grant.endsAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    ...clock,
                    timeZone: 'Asia/Dhaka',
                  }),
                })}
                {grant.ticketNumber && ` · ${ticketLabel(grant.ticketNumber)}`}
              </span>
              <OpenWorkspaceButton tenantId={grant.tenantId} grantId={grant.id} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
