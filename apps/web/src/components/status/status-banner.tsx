import { worstState, type IncidentView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Banner } from '../ui';
import { DHAKA_TIME } from './dhaka-time';
import { loadPublicStatus } from './load-status';
import { TONE } from './status-look';
import { clockOptions } from '@/lib/clock';

const DAY_MS = 86_400_000;

/**
 * Open incidents, and maintenance under way or starting within a day, in the reader's
 * language, above every workspace page and on the sign-in page. Nothing when all is well or
 * when the status cannot be read.
 */
export async function StatusBanner() {
  const status = await loadPublicStatus();
  if (!status) return null;
  // As of when the status was worked out, at most half a minute ago.
  const now = Date.parse(status.generatedAt);
  const shown = status.active.filter(
    (i) =>
      i.kind === 'incident' || i.status === 'in_progress' || Date.parse(i.startsAt) - now <= DAY_MS,
  );
  if (shown.length === 0) return null;
  const t = await getTranslations('status');
  const format = await getFormatter();
  const clock = await clockOptions();
  const bn = (await getLocale()) === 'bn';
  const line = (i: IncidentView) => {
    const title = bn ? i.titleBn : i.titleEn;
    if (i.kind === 'incident')
      return t('banner.incident', { state: t(`states.${i.impact}`), title });
    return i.status === 'in_progress' || Date.parse(i.startsAt) <= now
      ? t('banner.maintenanceNow', { title })
      : t('banner.maintenanceSoon', {
          title,
          from: format.dateTime(new Date(i.startsAt), { ...DHAKA_TIME, ...clock }),
        });
  };
  return (
    <Banner tone={TONE[worstState(shown.map((i) => i.impact))]}>
      <ul className="space-y-0.5">
        {shown.map((i) => (
          <li key={i.id} className="font-medium">
            {line(i)}
          </li>
        ))}
      </ul>
      <Link href="/status" className="mt-1 inline-block underline">
        {t('banner.link')}
      </Link>
    </Banner>
  );
}
