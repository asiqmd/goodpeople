import { can, type KioskView, type OrgSnapshot } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SetupTabs } from '@/components/attendance/setup-tabs';
import { HelpLink } from '@/components/help/help-link';
import { NewKioskForm, RevokeKioskButton } from '@/components/kiosk/kiosk-staff';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';

/** HR's kiosks: shared tablets where workers sign in with their ID card and a PIN. */
export default async function KiosksPage() {
  if (!can((await currentTenantUser())?.role, 'attendance.manage')) {
    redirect('/workspace/attendance');
  }
  const t = await getTranslations('kiosk.staff');
  const format = await getFormatter();
  const kiosks = await authedFetch<KioskView[]>('tenant', '/tenant/kiosks');
  if (!kiosks.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">
          {t('title')}
          <HelpLink slug="kiosks" />
        </h1>
        <SetupTabs active="kiosks" />
        <Banner tone="amber">
          {kiosks.error.code === 'feature_not_in_plan' ? t('notInPlan') : kiosks.error.message}
        </Banner>
      </>
    );
  }
  const org = await load<OrgSnapshot>('tenant', '/tenant/org');
  const request = await headers();
  const host = request.get('x-forwarded-host') ?? request.get('host');
  const kioskUrl = `${request.get('x-forwarded-proto') ?? 'https'}://${host}/kiosk`;
  const when = (iso: string | null) => (iso ? format.relativeTime(new Date(iso)) : t('never'));

  return (
    <>
      <h1 className="text-2xl font-semibold">
        {t('title')}
        <HelpLink slug="kiosks" />
      </h1>
      <SetupTabs active="kiosks" />
      <Card>
        <p className="mb-4 text-sm text-slate-600">{t('intro')}</p>
        {kiosks.data.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">{t('none')}</p>
        ) : (
          <ul className="mb-4 divide-y divide-slate-100 text-sm">
            {kiosks.data.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{k.name}</span>{' '}
                  <span className="font-mono text-xs text-slate-400">…{k.tokenPrefix}</span>
                  <span className="block text-xs text-slate-500">
                    {k.location?.name && `${k.location.name} · `}
                    {t('lastSeen', { when: when(k.lastSeenAt) })}
                  </span>
                </span>
                {k.revokedAt ? (
                  <Badge tone="slate">{t('revoked')}</Badge>
                ) : (
                  <RevokeKioskButton id={k.id} />
                )}
              </li>
            ))}
          </ul>
        )}
        <NewKioskForm locations={org.locations} kioskUrl={kioskUrl} />
      </Card>
    </>
  );
}
