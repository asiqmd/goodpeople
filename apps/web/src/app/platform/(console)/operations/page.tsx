import {
  BACKUP_STALE_HOURS,
  STATUS_COMPONENTS,
  VERIFY_STALE_DAYS,
  type BackupRunView,
  type OperationsView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { DHAKA_TIME } from '@/components/status/dhaka-time';
import { StateIcon } from '@/components/status/status-look';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

const head = 'px-3 py-2 font-medium';
const cell = 'px-3 py-2 align-top';

/** Backups and restore drills, the status page's checks, and readiness, for operations staff. */
export default async function OperationsPage() {
  const t = await getTranslations('operations');
  const ts = await getTranslations('status');
  const te = await getTranslations('errors');
  const format = await getFormatter();
  const clock = await clockOptions();
  const result = await authedFetch<OperationsView>('platform', '/platform/operations');
  if (!result.ok) {
    const { code, message } = result.error;
    return <Banner tone="amber">{code && te.has(code) ? te(code) : message}</Banner>;
  }
  const { backups, checks, readiness, backgroundJobs } = result.data;
  const time = (iso: string) => format.dateTime(new Date(iso), { ...DHAKA_TIME, ...clock });
  const since = (iso: string | null) =>
    iso ? `${format.relativeTime(new Date(iso))} (${time(iso)})` : t('none');
  const took = (run: BackupRunView) => {
    const seconds = Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000);
    return seconds < 60
      ? t('seconds', { count: seconds })
      : t('minutes', { count: Math.round(seconds / 60) });
  };
  const outcome = (ok: boolean) => (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <StateIcon state={ok ? 'operational' : 'major_outage'} className="size-4" />
      {ok ? t('ok') : t('failed')}
    </span>
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('intro')}</p>
      </div>

      <Card title={t('backups')}>
        <div className="space-y-3">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{t('lastBackup')}</dt>
              <dd className="mt-1 text-sm font-medium">{since(backups.lastBackupAt)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{t('lastDrill')}</dt>
              <dd className="mt-1 text-sm font-medium">{since(backups.lastDrillAt)}</dd>
            </div>
          </dl>
          {backups.staleBackup && (
            <Banner tone="red">{t('staleBackup', { hours: BACKUP_STALE_HOURS })}</Banner>
          )}
          {backups.staleDrill && (
            <Banner tone="amber">{t('staleDrill', { days: VERIFY_STALE_DAYS })}</Banner>
          )}
          <h3 className="pt-2 text-sm font-semibold text-slate-900">{t('runs')}</h3>
          {backups.runs.length === 0 ? (
            <p className="text-sm text-slate-600">{t('noRuns')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className={head}>{t('columns.kind')}</th>
                    <th className={head}>{t('columns.result')}</th>
                    <th className={head}>{t('columns.name')}</th>
                    <th className={head}>{t('columns.host')}</th>
                    <th className={head}>{t('columns.finished')}</th>
                    <th className={`${head} text-right`}>{t('columns.took')}</th>
                    <th className={`${head} text-right`}>{t('columns.size')}</th>
                    <th className={head}>{t('columns.detail')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.runs.map((run) => (
                    <tr key={run.id}>
                      <td className={cell}>{t(`kinds.${run.kind}`)}</td>
                      <td className={cell}>{outcome(run.ok)}</td>
                      <td className={`${cell} font-mono text-xs`}>{run.label ?? '–'}</td>
                      <td className={`${cell} text-xs`}>{run.host ?? '–'}</td>
                      <td className={`${cell} whitespace-nowrap`}>{time(run.finishedAt)}</td>
                      <td className={`${cell} text-end tabular-nums`}>{took(run)}</td>
                      <td className={`${cell} text-end tabular-nums`}>
                        {run.sizeBytes === null
                          ? '–'
                          : t('megabytes', { size: Math.round(run.sizeBytes / 104_857.6) / 10 })}
                      </td>
                      <td className={`${cell} font-mono text-xs text-slate-600`}>
                        {Object.entries(run.detail)
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card title={t('checks')}>
        <p className="mb-3 text-sm text-slate-600">{t('checksIntro')}</p>
        {!backgroundJobs && (
          <div className="mb-3">
            <Banner tone="slate">{t('jobsOff')}</Banner>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className={head}>{t('columns.component')}</th>
                <th className={head}>{t('columns.result')}</th>
                <th className={head}>{t('columns.checkedAt')}</th>
                <th className={`${head} text-right`}>{t('columns.latency')}</th>
                <th className={head}>{t('columns.detail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STATUS_COMPONENTS.map((key) => {
                const check = checks.find((c) => c.component === key);
                return (
                  <tr key={key}>
                    <td className={`${cell} font-medium`}>{ts(`components.${key}`)}</td>
                    {check ? (
                      <>
                        <td className={cell}>{outcome(check.ok)}</td>
                        <td className={`${cell} whitespace-nowrap`}>{time(check.checkedAt)}</td>
                        <td className={`${cell} text-end tabular-nums`}>
                          {check.latencyMs === null
                            ? '–'
                            : t('milliseconds', { ms: check.latencyMs })}
                        </td>
                        <td className={`${cell} break-all font-mono text-xs text-red-700`}>
                          {check.detail}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className={`${cell} text-slate-500`}>
                        {t('notChecked')}
                        {key === 'payments' && ` · ${t('paymentsNoCheck')}`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={t('readiness')}
        action={
          <Badge tone={readiness.status === 'ready' ? 'green' : 'red'}>
            {readiness.status === 'ready' ? t('ready') : t('notReady')}
          </Badge>
        }
      >
        <p className="mb-3 text-sm text-slate-600">{t('readinessIntro')}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(['database', 'documents', 'chromium', 'security'] as const).map((part) => (
            <li key={part} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="text-sm">{t(`parts.${part}`)}</span>
              {outcome(readiness.checks[part] === 'ok')}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
