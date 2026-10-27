import {
  COMPONENT_STATES,
  STATUS_HISTORY_DAYS,
  type ComponentState,
  type IncidentView,
} from '@gp/shared';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/forms';
import { HelpLink } from '@/components/help/help-link';
import { AutoRefresh } from '@/components/status/auto-refresh';
import { ComponentRow } from '@/components/status/component-row';
import { DHAKA_TIME } from '@/components/status/dhaka-time';
import { IncidentCard } from '@/components/status/incident-card';
import { loadPublicStatus } from '@/components/status/load-status';
import { FILL, StateIcon, type DayLook } from '@/components/status/status-look';
import { Banner, Logo } from '@/components/ui';
import { clockOptions } from '@/lib/clock';

const RECENT_DAYS = 7;

const OVERALL_RING: Record<ComponentState, string> = {
  operational: 'ring-[#0ca30c]/40 bg-[#0ca30c]/5',
  maintenance: 'ring-[#2a78d6]/40 bg-[#2a78d6]/5',
  degraded: 'ring-[#fab219]/60 bg-[#fab219]/10',
  partial_outage: 'ring-[#ec835a]/60 bg-[#ec835a]/10',
  major_outage: 'ring-[#d03b3b]/50 bg-[#d03b3b]/5',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('status');
  return { title: t('metaTitle') };
}

/** Maintenance that has not begun yet. */
const isUpcoming = (i: IncidentView, now: number) =>
  i.kind === 'maintenance' && i.status === 'scheduled' && Date.parse(i.startsAt) > now;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

/** The public status page: each part of the service now and over the last 90 days. */
export default async function StatusPage() {
  const t = await getTranslations('status');
  const format = await getFormatter();
  const clock = await clockOptions();
  const status = await loadPublicStatus();
  const now = status ? Date.parse(status.generatedAt) : 0;
  const current = status?.active.filter((i) => !isUpcoming(i, now)) ?? [];
  const upcoming = status?.active.filter((i) => isUpcoming(i, now)) ?? [];
  const legend: DayLook[] = [...COMPONENT_STATES, 'no_data'];
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <AutoRefresh seconds={60} />
      <header className="flex items-center justify-between gap-4">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
            {t('signIn')}
          </Link>
          <LanguageToggle />
        </nav>
      </header>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {t('title')}
          <HelpLink slug="status-page" />
        </h1>
        <p className="mt-2 text-slate-600">{t('intro', { days: STATUS_HISTORY_DAYS })}</p>
      </div>
      {!status ? (
        <Banner tone="amber">{t('unavailable')}</Banner>
      ) : (
        <>
          <div
            role="status"
            className={`flex items-center gap-3 rounded-xl px-5 py-4 ring-1 ring-inset ${OVERALL_RING[status.overall]}`}
          >
            <StateIcon state={status.overall} className="size-7" />
            <p className="text-lg font-semibold text-slate-900">{t(`overall.${status.overall}`)}</p>
          </div>
          {current.length > 0 && (
            <Section title={t('active')}>
              {current.map((i) => (
                <IncidentCard key={i.id} incident={i} />
              ))}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title={t('upcoming')}>
              {upcoming.map((i) => (
                <IncidentCard key={i.id} incident={i} />
              ))}
            </Section>
          )}
          <Section title={t('systems')}>
            <div className="rounded-xl bg-white px-5 shadow-sm ring-1 ring-slate-200">
              <div className="divide-y divide-slate-100">
                {status.components.map((c) => (
                  <ComponentRow key={c.key} component={c} />
                ))}
              </div>
              <div className="border-t border-slate-100 py-4 text-xs text-slate-600">
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {legend.map((look) => (
                    <li key={look} className="inline-flex items-center gap-1.5">
                      <span aria-hidden className={`size-3 rounded-[2px] ${FILL[look]}`} />
                      {t(`states.${look}`)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-slate-500">{t('legendNote')}</p>
              </div>
            </div>
          </Section>
          <Section title={t('recent', { days: RECENT_DAYS })}>
            {status.recent.length > 0 ? (
              status.recent.map((i) => <IncidentCard key={i.id} incident={i} />)
            ) : (
              <p className="text-sm text-slate-600">{t('noRecent', { days: RECENT_DAYS })}</p>
            )}
          </Section>
          <p className="text-xs text-slate-500">
            {t('updated', {
              time: format.dateTime(new Date(status.generatedAt), { ...DHAKA_TIME, ...clock }),
            })}
          </p>
        </>
      )}
    </main>
  );
}
