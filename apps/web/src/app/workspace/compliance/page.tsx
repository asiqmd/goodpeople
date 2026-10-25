import { addDays, can, todayIn, type ComplianceOverview } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckForm } from '@/components/compliance/compliance-forms';
import {
  AlertMeasure,
  ComplianceTabs,
  KIND_GROUPS,
  period,
} from '@/components/compliance/compliance-views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const RECORDS = [
  ['committees', '/workspace/compliance/committees'],
  ['unions', '/workspace/compliance/unions'],
  ['audit', '/workspace/compliance/audit'],
] as const;

export default async function ComplianceOverviewPage() {
  if (!can((await currentTenantUser())?.role, 'compliance.manage')) redirect('/workspace');
  const t = await getTranslations('compliance');
  const format = await getFormatter();
  const overview = await load<ComplianceOverview>('tenant', '/tenant/compliance/overview');
  const n = (v: number) => format.number(v);
  const today = todayIn();
  const counts = new Map(overview.kinds.map((k) => [k.kind, k]));

  const stats = [
    {
      label: t('overview.open'),
      value: overview.open,
      href: '/workspace/compliance/alerts?status=open',
    },
    {
      label: t('overview.acknowledged'),
      value: overview.acknowledged,
      href: '/workspace/compliance/alerts?status=acknowledged',
    },
    { label: t('overview.resolved'), value: overview.resolvedLast30Days, href: null },
    {
      label: t('overview.adolescents', { missing: overview.adolescentsWithoutCertificate }),
      value: overview.adolescents,
      href: '/workspace/compliance/adolescents',
    },
    {
      label: t('overview.consents'),
      value: overview.womenWithNightConsent,
      href: '/workspace/compliance/night-work',
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{t('intro')}</p>
      </div>
      <ComplianceTabs active="overview" />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => {
          const body = (
            <>
              <span className="block text-2xl font-semibold tabular-nums">{n(s.value)}</span>
              <span className="text-xs text-slate-600">{s.label}</span>
            </>
          );
          return s.href ? (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-brand-600"
            >
              {body}
            </Link>
          ) : (
            <div key={s.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              {body}
            </div>
          );
        })}
      </div>

      <Card title={t('overview.byKind')}>
        <div className="grid gap-6 md:grid-cols-2">
          {KIND_GROUPS.map(({ group, kinds }) => (
            <section key={group}>
              <h3 className="text-sm font-semibold text-slate-800">{t(`groups.${group}`)}</h3>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {kinds.map((kind) => {
                  const c = counts.get(kind) ?? { open: 0, acknowledged: 0 };
                  return (
                    <li key={kind} className="flex items-center justify-between gap-3 py-1.5">
                      <Link
                        href={`/workspace/compliance/alerts?kind=${kind}`}
                        className="hover:underline"
                      >
                        {t(`kinds.${kind}`)}
                      </Link>
                      <span className="flex gap-3 tabular-nums">
                        <span className={c.open ? 'font-semibold text-red-700' : 'text-slate-400'}>
                          {t('overview.openCount', { count: c.open })}
                        </span>
                        <span className={c.acknowledged ? 'text-amber-700' : 'text-slate-400'}>
                          {t('overview.acknowledgedCount', { count: c.acknowledged })}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      <Card
        title={t('overview.latest')}
        action={
          <Link href="/workspace/compliance/alerts" className="text-sm font-medium text-brand-700">
            {t('overview.allAlerts')} →
          </Link>
        }
      >
        {overview.latest.length === 0 ? (
          <p className="text-sm text-slate-500">{t('overview.none')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {overview.latest.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{t(`kinds.${a.kind}`)}</span>
                  {' · '}
                  {a.employee ? a.employee.fullName : (a.subjectName ?? '—')}
                </span>
                <span className="text-slate-600">
                  {period(format, a.periodStart, a.periodEnd)} · <AlertMeasure alert={a} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('overview.checkTitle')}>
          <p className="mb-3 text-sm text-slate-600">{t('overview.checkHint')}</p>
          <CheckForm from={addDays(today, -13)} to={today} />
        </Card>
        <Card title={t('overview.recordsTitle')}>
          <ul className="space-y-3 text-sm">
            {RECORDS.map(([key, href]) => (
              <li key={key}>
                <Link href={href} className="font-medium text-brand-700 hover:underline">
                  {t(`records.${key}`)}
                </Link>
                <p className="text-slate-600">{t(`records.${key}Hint`)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
