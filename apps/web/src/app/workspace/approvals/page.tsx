import type {
  ApprovalItem,
  LeaveApprovalItem,
  RegularizationApprovalItem,
  SeparationApprovalItem,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/attendance/attendance-views';
import { DecisionForm } from '@/components/leave/leave-forms';
import { day, typeName } from '@/components/leave/leave-views';
import {
  CompensationItem,
  LoanApprovalCard,
  PayBatchApprovalCard,
  RunApprovalItem,
} from '@/components/payroll/payroll-views';
import { TimesheetApprovalCard } from '@/components/timesheets/timesheet-views';
import { Badge, Card } from '@/components/ui';
import { load } from '@/lib/api';

export default async function ApprovalsPage() {
  const items = await load<ApprovalItem[]>('tenant', '/tenant/approvals');
  const t = await getTranslations('leave');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('approvals.title')}</h1>
      {items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">{t('approvals.none')}</p>
        </Card>
      ) : (
        items.map((item) => (
          <Card key={item.stepId}>
            <div className="flex flex-wrap items-start justify-between gap-6">
              {item.subjectType === 'leave_request' ? (
                <LeaveItem item={item} />
              ) : item.subjectType === 'regularization' ? (
                <CorrectionItem item={item} />
              ) : item.subjectType === 'compensation' ? (
                <CompensationItem item={item} />
              ) : item.subjectType === 'payroll_run' ? (
                <RunApprovalItem item={item} />
              ) : item.subjectType === 'loan' ? (
                <LoanApprovalCard item={item} />
              ) : item.subjectType === 'pay_batch' ? (
                <PayBatchApprovalCard item={item} />
              ) : item.subjectType === 'timesheet' ? (
                <TimesheetApprovalCard item={item} />
              ) : (
                <SeparationItem item={item} />
              )}
              <div className="w-full max-w-sm">
                <DecisionForm stepId={item.stepId} />
              </div>
            </div>
          </Card>
        ))
      )}
    </>
  );
}

async function LeaveItem({ item: { kind, request: r, balance } }: { item: LeaveApprovalItem }) {
  const t = await getTranslations('leave');
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium text-slate-900">
        {r.employee.fullName}{' '}
        <span className="font-mono text-xs text-slate-400">{r.employee.employeeCode}</span>
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
          {t('approvals.available', { available: format.number(balance.available + r.days) })}
        </p>
      )}
      {r.needsDocument && <p className="text-xs text-amber-700">{t('request.needsDocument')}</p>}
      <Badge tone="blue">{t(`step.${kind}`)}</Badge>
    </div>
  );
}

async function CorrectionItem({
  item: { kind, regularization: r, day: current },
}: {
  item: RegularizationApprovalItem;
}) {
  const t = await getTranslations('attendance');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium text-slate-900">
        {r.employee.fullName}{' '}
        <span className="font-mono text-xs text-slate-400">{r.employee.employeeCode}</span>
      </p>
      <p className="text-sm text-slate-700">
        {t(`correction.kinds.${r.kind}`)} · {day(format, r.date)}
        {r.inTime && ` · ${t('correction.inTime')} ${r.inTime}`}
        {r.outTime && ` · ${t('correction.outTime')} ${r.outTime}`}
      </p>
      <p className="text-sm text-slate-600">{r.reason}</p>
      {current && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          {t('correction.recorded')} <StatusBadge day={current} />
        </p>
      )}
      <div className="flex gap-2">
        <Badge tone="violet">{t('correction.badge')}</Badge>
        <Badge tone="blue">{tl(`step.${kind}`)}</Badge>
      </div>
    </div>
  );
}

async function SeparationItem({ item: { kind, separation: s } }: { item: SeparationApprovalItem }) {
  const t = await getTranslations('lifecycle.separation');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium text-slate-900">
        {s.employee.fullName}{' '}
        <span className="font-mono text-xs text-slate-400">{s.employee.employeeCode}</span>
      </p>
      <p className="text-sm text-slate-700">
        {t(`types.${s.type}`)} ·{' '}
        {t('dates', { notice: day(format, s.noticeDate), last: day(format, s.lastWorkingDay) })}
      </p>
      <p className="text-sm text-slate-600">{s.reason}</p>
      {s.noticeShortfallDays > 0 && (
        <p className="text-xs text-amber-700">{t('shortfall', { days: s.noticeShortfallDays })}</p>
      )}
      <div className="flex gap-2">
        <Badge tone="red">{t('badge')}</Badge>
        <Badge tone="blue">{tl(`step.${kind}`)}</Badge>
      </div>
    </div>
  );
}
