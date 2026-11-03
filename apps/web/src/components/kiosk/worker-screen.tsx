'use client';

import { addDays, todayIn, type KioskMeView, type LeaveBalanceView } from '@gp/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { applyKioskLeave, loadWorker } from '@/app/actions/kiosk';
import { bigButton, bigInput, LanguageSwitch, Notice } from './kiosk-controls';

type Formatter = ReturnType<typeof useFormatter>;

const taka = (format: Formatter, amount: string) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;

/** A shift's "08:00" as the reader writes times, in their digits. */
const clock = (format: Formatter, hhmm: string) =>
  format.dateTime(new Date(`2000-01-01T${hhmm}:00Z`), {
    hour: 'numeric',
    minute: '2-digit',
    // Factories keep the 24-hour clock, and Bangla then needs no Latin "AM" or "PM".
    hourCycle: 'h23',
    timeZone: 'UTC',
  });

function Tile({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ${className}`}>
      <h2 className="text-2xl font-semibold text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-4xl font-bold tabular-nums">{value}</p>
      <p className="text-lg text-slate-600">{label}</p>
    </div>
  );
}

/** The signed-in worker's own screen: today, this month, leave, payslips and speaking up. */
export function WorkerScreen({
  me,
  secondsLeft,
  onRefreshed,
  onDone,
  onEnded,
  onOpenPayslip,
  onSpeakUp,
}: {
  me: KioskMeView;
  secondsLeft: number | null;
  onRefreshed: (me: KioskMeView) => void;
  onDone: () => void;
  onEnded: (message: string) => void;
  onOpenPayslip: (url: string) => void;
  onSpeakUp: () => Promise<void>;
}) {
  const t = useTranslations('kiosk.worker');
  const locale = useLocale();
  const format = useFormatter();
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bn = (en: string | null, bangla: string | null) => (locale === 'bn' && bangla) || en;
  const name = bn(me.employee.name, me.employee.nameBn)!;
  const role = [
    bn(me.employee.designation, me.employee.designationBn),
    bn(me.employee.line, me.employee.lineBn),
  ].filter(Boolean);

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <header className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold">{t('hello', { name })}</h1>
          <p className="mt-1 text-xl text-slate-600">
            <span className="font-mono">{me.employee.code}</span>
            {role.length > 0 && ` · ${role.join(' · ')}`}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <LanguageSwitch />
          {secondsLeft !== null && (
            <p className="text-xl text-amber-700">{t('signingOut', { seconds: secondsLeft })}</p>
          )}
          <button type="button" onClick={onDone} className={`${bigButton.primary} min-w-48`}>
            {t('done')}
          </button>
        </div>
      </header>

      {notice && <Notice tone="green">{notice}</Notice>}

      {applying && me.leave ? (
        <LeaveForm
          balances={me.leave}
          onCancel={() => setApplying(false)}
          onEnded={onEnded}
          onSent={(fresh) => {
            setApplying(false);
            setNotice(t('leaveSent'));
            if (fresh) onRefreshed(fresh);
          }}
        />
      ) : (
        <div className="grid flex-1 grid-cols-3 gap-6">
          {me.today && (
            <Tile title={t('today')}>
              <p className="text-xl text-slate-600">
                {format.dateTime(new Date(`${me.today.date}T00:00:00Z`), {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                })}
              </p>
              <p className="text-4xl font-bold">
                {me.today.holidayName ?? t(`status.${me.today.status}`)}
              </p>
              {me.today.shift && (
                <p className="text-xl">
                  {t('shift', {
                    start: clock(format, me.today.shift.startTime),
                    end: clock(format, me.today.shift.endTime),
                  })}
                </p>
              )}
              <p className="text-xl text-slate-700">
                {me.today.punches.length === 0
                  ? t('noPunches')
                  : t('punches', {
                      times: me.today.punches
                        .map((at) =>
                          format.dateTime(new Date(at), {
                            hour: 'numeric',
                            minute: '2-digit',
                            hourCycle: 'h23',
                            timeZone: me.timeZone,
                          }),
                        )
                        .join(', '),
                    })}
              </p>
            </Tile>
          )}
          {me.month && (
            <Tile title={t('month')}>
              <div className="grid grid-cols-2 gap-3">
                <Count
                  label={t('present')}
                  value={format.number(me.month.present + me.month.halfDay / 2)}
                />
                <Count label={t('absent')} value={format.number(me.month.absent)} />
                <Count label={t('onLeave')} value={format.number(me.month.onLeave)} />
                <Count
                  label={t('overtime')}
                  value={format.number(me.month.overtimeMinutes / 60, {
                    maximumFractionDigits: 1,
                  })}
                />
              </div>
            </Tile>
          )}
          {me.leave && (
            <Tile title={t('leave')}>
              <ul className="space-y-2 text-xl">
                {me.leave.map((b) => (
                  <li key={b.leaveType.id} className="flex justify-between gap-4">
                    <span>{bn(b.leaveType.name, b.leaveType.nameBn)}</span>
                    <span className="font-semibold tabular-nums">
                      {t('daysLeft', { count: b.available ?? 0 })}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setApplying(true);
                }}
                className={`${bigButton.secondary} mt-auto`}
              >
                {t('apply')}
              </button>
            </Tile>
          )}
          {me.payslips && (
            <Tile title={t('payslips')} className="col-span-2">
              {me.payslips.length === 0 ? (
                <p className="text-xl text-slate-500">{t('noPayslips')}</p>
              ) : (
                <ul className="grid grid-cols-3 gap-4">
                  {me.payslips.map((p) => (
                    <li key={p.itemId}>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPayslip(`/kiosk/payslips/${p.itemId}?language=${locale}`)
                        }
                        className="flex min-h-32 w-full flex-col items-start justify-center gap-1 rounded-2xl bg-slate-50 p-5 text-start ring-2 ring-inset ring-slate-200 active:bg-slate-200"
                      >
                        <span className="text-xl text-slate-600">
                          {bn(p.festival, p.festivalBn) ??
                            format.dateTime(new Date(`${p.periodStart}T00:00:00Z`), {
                              month: 'long',
                              year: 'numeric',
                              timeZone: 'UTC',
                            })}
                        </span>
                        <span className="text-3xl font-bold tabular-nums">
                          {taka(format, p.net)}
                        </span>
                        <span className="text-lg font-medium text-brand-700">{t('open')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Tile>
          )}
          <Tile title={t('speakUp')}>
            <p className="text-xl text-slate-600">{t('speakUpHint')}</p>
            <button
              type="button"
              onClick={() => void onSpeakUp()}
              className={`${bigButton.secondary} mt-auto`}
            >
              {t('speakUpOpen')}
            </button>
          </Tile>
        </div>
      )}
    </main>
  );
}

const REASONS = ['illness', 'family', 'personal'] as const;

const choice = (selected: boolean) =>
  `min-h-20 rounded-2xl px-6 text-2xl font-semibold ring-2 ring-inset ${
    selected
      ? 'bg-brand-600 text-white ring-brand-600'
      : 'bg-white text-slate-800 ring-slate-300 active:bg-slate-100'
  }`;

function LeaveForm({
  balances,
  onCancel,
  onSent,
  onEnded,
}: {
  balances: LeaveBalanceView[];
  onCancel: () => void;
  onSent: (fresh: KioskMeView | null) => void;
  onEnded: (message: string) => void;
}) {
  const t = useTranslations('kiosk.applyLeave');
  const tk = useTranslations('kiosk');
  const locale = useLocale();
  const tomorrow = addDays(todayIn(), 1);
  const [typeId, setTypeId] = useState(balances.find((b) => (b.available ?? 0) > 0)?.leaveType.id);
  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState(tomorrow);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const send = () =>
    start(async () => {
      const reply = await applyKioskLeave({ leaveTypeId: typeId!, startDate, endDate, reason });
      if (reply.ok) {
        const fresh = await loadWorker();
        return onSent(fresh.ok ? fresh.data : null);
      }
      if (reply.code === 'kiosk_session_ended' || reply.code === 'kiosk_employee_inactive') {
        return onEnded(tk(reply.code === 'kiosk_session_ended' ? 'ended' : 'inactive'));
      }
      setError(
        reply.code === 'leave_not_allowed'
          ? t('refused', { detail: reply.message })
          : reply.code === 'validation_failed'
            ? t('check')
            : reply.code === 'tenant_read_only'
              ? tk('readOnly')
              : tk('failed'),
      );
    });

  return (
    <section className="flex flex-1 flex-col gap-6 rounded-3xl bg-white p-8 shadow-sm">
      <h2 className="text-3xl font-bold">{t('title')}</h2>
      <div className="space-y-3">
        <p className="text-2xl font-medium">{t('type')}</p>
        <div className="flex flex-wrap gap-3">
          {balances.map((b) => (
            <button
              key={b.leaveType.id}
              type="button"
              disabled={(b.available ?? 0) <= 0}
              aria-pressed={typeId === b.leaveType.id}
              onClick={() => setTypeId(b.leaveType.id)}
              className={`${choice(typeId === b.leaveType.id)} disabled:opacity-40`}
            >
              {(locale === 'bn' && b.leaveType.nameBn) || b.leaveType.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <label className="space-y-3">
          <span className="block text-2xl font-medium">{t('from')}</span>
          <input
            type="date"
            value={startDate}
            min={todayIn()}
            onChange={(event) => {
              setStartDate(event.target.value);
              if (event.target.value > endDate) setEndDate(event.target.value);
            }}
            className={bigInput}
          />
        </label>
        <label className="space-y-3">
          <span className="block text-2xl font-medium">{t('to')}</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={bigInput}
          />
        </label>
      </div>
      <div className="space-y-3">
        <p className="text-2xl font-medium">{t('reason')}</p>
        <div className="flex flex-wrap gap-3">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === t(`reasons.${r}`)}
              onClick={() => setReason(t(`reasons.${r}`))}
              className={choice(reason === t(`reasons.${r}`))}
            >
              {t(`reasons.${r}`)}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          placeholder={t('reasonPlaceholder')}
          className={bigInput}
        />
      </div>
      {error && <Notice tone="red">{error}</Notice>}
      <div className="mt-auto flex justify-end gap-4">
        <button type="button" onClick={onCancel} className={bigButton.secondary}>
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy || !typeId || reason.trim().length < 3}
          className={`${bigButton.primary} min-w-48`}
        >
          {busy ? '…' : t('send')}
        </button>
      </div>
    </section>
  );
}
