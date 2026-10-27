import type { SupportSessionView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { endSupportSession } from '@/app/actions/support-access';
import { SubmitButton } from '@/components/forms';
import { Banner } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

/** Shown on every workspace page while Good People support is inside, read-only. */
export async function SupportSessionBanner() {
  const result = await authedFetch<SupportSessionView>('tenant', '/tenant/support/access/session');
  if (!result.ok) return null;
  const t = await getTranslations('supportAccess.banner');
  const format = await getFormatter();
  const clock = await clockOptions();
  const until = format.dateTime(new Date(result.data.endsAt), {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...clock,
    timeZone: 'Asia/Dhaka',
  });
  return (
    <Banner tone="violet">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{t('text', { workspace: result.data.tenantName, until })}</span>
        <form action={endSupportSession}>
          <SubmitButton variant="secondary">{t('end')}</SubmitButton>
        </form>
      </div>
    </Banner>
  );
}
