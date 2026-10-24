import type { AuditEntry } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';

export async function AuditTable({
  entries,
  showTenant,
}: {
  entries: AuditEntry[];
  showTenant: boolean;
}) {
  const t = await getTranslations('platform');
  const format = await getFormatter();
  if (entries.length === 0) return <p className="text-sm text-slate-500">{t('noAudit')}</p>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-2 font-medium">{t('when')}</th>
            <th className="px-5 py-2 font-medium">{t('action')}</th>
            {showTenant && <th className="px-5 py-2 font-medium">{t('workspace')}</th>}
            <th className="px-5 py-2 font-medium">{t('actor')}</th>
            <th className="px-5 py-2 font-medium">{t('reason')}</th>
            <th className="px-5 py-2 font-medium">{t('details')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                {format.dateTime(new Date(e.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </td>
              <td className="px-5 py-3 font-mono text-xs">{e.action}</td>
              {showTenant && <td className="px-5 py-3">{e.tenantSlug ?? '—'}</td>}
              <td className="px-5 py-3">{e.actorEmail ?? '—'}</td>
              <td className="px-5 py-3">{e.reason}</td>
              <td className="px-5 py-3">
                <code className="block max-w-sm whitespace-pre-wrap break-words text-xs text-slate-600">
                  {JSON.stringify(e.after)}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
