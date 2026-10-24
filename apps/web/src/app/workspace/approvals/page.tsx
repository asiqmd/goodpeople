import type { ApprovalItem } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { DecisionForm } from '@/components/leave/leave-forms';
import { day, typeName } from '@/components/leave/leave-views';
import { Badge, Card } from '@/components/ui';
import { load } from '@/lib/api';

export default async function ApprovalsPage() {
  const items = await load<ApprovalItem[]>('tenant', '/tenant/approvals');
  const t = await getTranslations('leave');
  const format = await getFormatter();
  const locale = await getLocale();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('approvals.title')}</h1>
      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">{t('approvals.none')}</p>
        </Card>
      ) : (
        items.map(({ stepId, kind, request: r, balance }) => (
          <Card key={stepId}>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-slate-900">
                  {r.employee.fullName}{' '}
                  <span className="font-mono text-xs text-slate-400">
                    {r.employee.employeeCode}
                  </span>
                </p>
                <p className="text-sm text-slate-700">
                  {typeName(r.leaveType, locale)} ·{' '}
                  {r.startDate === r.endDate
                    ? day(format, r.startDate)
                    : `${day(format, r.startDate)} – ${day(format, r.endDate)}`}{' '}
                  · {t('request.days', { days: r.days })}
                </p>
                <p className="text-sm text-slate-600">{r.reason}</p>
                {balance?.available != null && (
                  <p className="text-xs text-slate-500">
                    {t('approvals.available', {
                      available: format.number(balance.available + r.days),
                    })}
                  </p>
                )}
                {r.needsDocument && (
                  <p className="text-xs text-amber-700">{t('request.needsDocument')}</p>
                )}
                <Badge tone="blue">{t(`step.${kind}`)}</Badge>
              </div>
              <div className="w-full max-w-sm">
                <DecisionForm stepId={stepId} />
              </div>
            </div>
          </Card>
        ))
      )}
    </>
  );
}
