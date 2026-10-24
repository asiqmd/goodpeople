import type { LeaveBalanceView, LeaveRequestStatus, LeaveRequestView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge, Card, type Tone } from '../ui';
import { CancelLeaveButton } from './leave-forms';

export const STATUS_TONE: Record<LeaveRequestStatus, Tone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  cancelled: 'slate',
};

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
export const day = (format: Formatter, iso: string) =>
  format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

/** A leave type's name in the reader's language. */
export const typeName = (t: { name: string; nameBn: string | null }, locale: string) =>
  locale === 'bn' && t.nameBn ? t.nameBn : t.name;

export async function BalanceCards({ balances }: { balances: LeaveBalanceView[] }) {
  const t = await getTranslations('leave.balance');
  const format = await getFormatter();
  const locale = await getLocale();
  const n = (value: number) => format.number(value);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {balances.map((b) => (
        <Card key={b.leaveType.id}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">{typeName(b.leaveType, locale)}</p>
            <span className="font-mono text-xs text-slate-400">{b.leaveType.code}</span>
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {b.available === null ? (
              <span className="text-lg">{t('onRequest')}</span>
            ) : (
              n(b.available)
            )}
          </p>
          <p className="text-xs text-slate-500">{b.available === null ? '' : t('available')}</p>
          <dl className="mt-3 space-y-0.5 text-xs text-slate-600">
            {b.entitlement !== null && (
              <div className="flex justify-between">
                <dt>{t('entitlement')}</dt>
                <dd>{n(b.entitlement)}</dd>
              </div>
            )}
            {b.carriedForward > 0 && (
              <div className="flex justify-between">
                <dt>{t('carried')}</dt>
                <dd>{n(b.carriedForward)}</dd>
              </div>
            )}
            {b.adjustments !== 0 && (
              <div className="flex justify-between">
                <dt>{t('adjustments')}</dt>
                <dd>{n(b.adjustments)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>{t('taken')}</dt>
              <dd>{n(b.taken)}</dd>
            </div>
            {b.pending > 0 && (
              <div className="flex justify-between">
                <dt>{t('pending')}</dt>
                <dd>{n(b.pending)}</dd>
              </div>
            )}
          </dl>
          {b.eligibleFrom && (
            <p className="mt-2 text-xs text-amber-700">
              {t('eligibleFrom', { date: day(format, b.eligibleFrom) })}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

/** Requests with their approval trail. `canCancel` shows the cancel button where it applies. */
export async function RequestList({
  requests,
  canCancel,
  showEmployee = false,
  today,
}: {
  requests: LeaveRequestView[];
  canCancel: boolean;
  showEmployee?: boolean;
  today: string;
}) {
  const t = await getTranslations('leave');
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <ul className="divide-y divide-slate-100">
      {requests.map((r) => {
        const cancellable =
          canCancel && (r.status === 'pending' || (r.status === 'approved' && r.startDate > today));
        return (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-slate-900">
                {showEmployee && <span>{r.employee.fullName} · </span>}
                {typeName(r.leaveType, locale)}
                <span className="font-normal text-slate-500">
                  {' · '}
                  {r.startDate === r.endDate
                    ? day(format, r.startDate)
                    : `${day(format, r.startDate)} – ${day(format, r.endDate)}`}
                  {' · '}
                  {t('request.days', { days: r.days })}
                  {r.halfDay && ` (${t(`form.${r.halfDay}`)})`}
                </span>
              </p>
              <p className="text-sm text-slate-600">{r.reason}</p>
              <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {r.steps.map((s) => (
                  <li key={s.id}>
                    {t(`step.${s.kind}`)}
                    {s.approver && ` (${s.approver.fullName})`}: {t(`step.${s.status}`)}
                    {s.decidedBy && ` ${t('request.by', { name: s.decidedBy })}`}
                    {s.comment && ` · “${s.comment}”`}
                  </li>
                ))}
              </ol>
              {r.needsDocument && (
                <p className="text-xs text-amber-700">{t('request.needsDocument')}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
              {cancellable && <CancelLeaveButton requestId={r.id} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
