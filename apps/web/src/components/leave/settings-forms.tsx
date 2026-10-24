'use client';

import {
  APPROVAL_STEP_KINDS,
  HOLIDAY_KINDS,
  LEAVE_ACCRUALS,
  type HolidayCalendarView,
  type HolidayView,
  type LeaveTypeView,
  type LocationView,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useTransition, type ReactNode } from 'react';
import {
  addHoliday,
  adjustLeave,
  confirmHoliday,
  createCalendar,
  createLeaveType,
  deleteHoliday,
  importHolidays,
  updateLeaveType,
  updateLocationCalendar,
  type HolidayState,
} from '@/app/actions/leave';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Messages({ state, saved }: { state: ActionState<unknown>; saved: string }) {
  return (
    <>
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
          {state.issues?.length ? (
            <ul className="mt-1 list-inside list-disc">
              {state.issues.map((i) => (
                <li key={`${i.path}-${i.message}`}>{i.message}</li>
              ))}
            </ul>
          ) : null}
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{saved}</Banner>}
    </>
  );
}

function Check({
  name,
  label,
  defaultChecked,
  value,
}: {
  name: string;
  label: ReactNode;
  defaultChecked: boolean;
  value?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

/** Policy fields shared by the edit and create forms; which ones show depends on accrual. */
function PolicyFields({
  type,
  accrual,
}: {
  type?: LeaveTypeView;
  accrual: LeaveTypeView['accrual'];
}) {
  const t = useTranslations('leave.settings');
  const th = useTranslations('hr');
  return (
    <>
      {accrual === 'annual_grant' && (
        <Field label={t('daysPerYear')}>
          <input
            name="daysPerYear"
            type="number"
            step="0.5"
            min={0}
            required
            defaultValue={type?.daysPerYear ?? ''}
            className={inputClass}
          />
        </Field>
      )}
      {accrual === 'earned' && (
        <Field label={t('rate')} hint={t('rateHint')}>
          <input
            name="workedDaysPerLeaveDay"
            type="number"
            min={1}
            max={60}
            defaultValue={type?.workedDaysPerLeaveDay ?? ''}
            className={inputClass}
          />
        </Field>
      )}
      {accrual === 'per_event' && (
        <Field label={t('maxDays')}>
          <input
            name="maxDaysPerRequest"
            type="number"
            min={1}
            required
            defaultValue={type?.maxDaysPerRequest ?? ''}
            className={inputClass}
          />
        </Field>
      )}
      <Field label={t('carry')}>
        <input
          name="carryForwardMax"
          type="number"
          step="0.5"
          min={0}
          defaultValue={type?.carryForwardMax ?? 0}
          className={inputClass}
        />
      </Field>
      <Field label={t('minService')}>
        <input
          name="minServiceDays"
          type="number"
          min={0}
          defaultValue={type?.minServiceDays ?? 0}
          className={inputClass}
        />
      </Field>
      <Field label={t('documentAfter')}>
        <input
          name="requiresDocumentAfterDays"
          type="number"
          min={0}
          defaultValue={type?.requiresDocumentAfterDays ?? ''}
          className={inputClass}
        />
      </Field>
      <Field label={t('gender')}>
        <select name="gender" defaultValue={type?.gender ?? ''} className={inputClass}>
          <option value="">{t('anyGender')}</option>
          <option value="female">{th('genders.female')}</option>
          <option value="male">{th('genders.male')}</option>
        </select>
      </Field>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-800">{t('chain')}</p>
        {APPROVAL_STEP_KINDS.map((kind) => (
          <Check
            key={kind}
            name="approvalChain"
            value={kind}
            label={kind === 'manager' ? th('form.manager') : 'HR'}
            defaultChecked={type ? type.approvalChain.includes(kind) : true}
          />
        ))}
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Check
          name="countsOffDays"
          label={t('countsOffDays')}
          defaultChecked={type?.countsOffDays ?? false}
        />
        <Check
          name="allowHalfDay"
          label={t('allowHalfDay')}
          defaultChecked={type?.allowHalfDay ?? true}
        />
        <Check name="paid" label={t('paid')} defaultChecked={type?.paid ?? true} />
      </div>
    </>
  );
}

export function LeaveTypeForm({ type }: { type: LeaveTypeView }) {
  const t = useTranslations('leave.settings');
  const [state, action] = useActionState<ActionState, FormData>(
    updateLeaveType.bind(null, type.id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3">
      <Messages state={state} saved={t('saved')} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input name="name" required defaultValue={type.name} className={inputClass} />
        </Field>
        <Field label={t('nameBn')}>
          <input name="nameBn" lang="bn" defaultValue={type.nameBn ?? ''} className={inputClass} />
        </Field>
        <PolicyFields type={type} accrual={type.accrual} />
        <Check name="isActive" label={t('active')} defaultChecked={type.isActive} />
      </div>
      <SubmitButton variant="secondary">{t('save')}</SubmitButton>
    </Form>
  );
}

export function NewLeaveTypeForm() {
  const t = useTranslations('leave.settings');
  const th = useTranslations('hr');
  const [state, action] = useActionState<ActionState, FormData>(createLeaveType, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <Form ref={form} state={state} action={action} className="space-y-3">
      <Messages state={state} saved={t('saved')} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('code')} error={issueFor(state, 'code')}>
          <input name="code" required pattern="[A-Z][A-Z0-9_]{0,9}" className={inputClass} />
        </Field>
        <Field label={t('name')}>
          <input name="name" required className={inputClass} />
        </Field>
        <Field label={t('nameBn')}>
          <input name="nameBn" lang="bn" className={inputClass} />
        </Field>
        <Field label={t('accrual')}>
          <select name="accrual" defaultValue="per_event" className={inputClass}>
            {LEAVE_ACCRUALS.filter((a) => a !== 'earned').map((a) => (
              <option key={a} value={a}>
                {t(`accruals.${a}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('daysPerYear')}>
          <input name="daysPerYear" type="number" step="0.5" min={0} className={inputClass} />
        </Field>
        <Field label={t('maxDays')}>
          <input name="maxDaysPerRequest" type="number" min={1} className={inputClass} />
        </Field>
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-800">{t('chain')}</p>
          <Check name="approvalChain" value="manager" label={th('form.manager')} defaultChecked />
          <Check name="approvalChain" value="hr" label="HR" defaultChecked={false} />
        </div>
        <div className="space-y-1">
          <Check name="paid" label={t('paid')} defaultChecked />
          <Check name="allowHalfDay" label={t('allowHalfDay')} defaultChecked />
        </div>
      </div>
      <SubmitButton variant="secondary">{t('addType')}</SubmitButton>
    </Form>
  );
}

function HolidayResult({ state }: { state: HolidayState }) {
  const t = useTranslations('leave.settings');
  if (state?.error)
    return (
      <Banner tone="red">
        <ErrorText state={state} />
      </Banner>
    );
  if (!state?.ok) return null;
  const r = state.result;
  return (
    <Banner tone="green">
      {r?.added !== undefined
        ? t('imported', { added: r.added, skipped: r.skipped ?? 0 })
        : t('saved')}
      {r?.recalculated ? ` · ${t('recalculated', { count: r.recalculated })}` : ''}
    </Banner>
  );
}

export function AddHolidayForm({ calendarId }: { calendarId: string }) {
  const t = useTranslations('leave.settings');
  const [state, action] = useActionState<HolidayState, FormData>(
    addHoliday.bind(null, calendarId),
    undefined,
  );
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <Form ref={form} state={state} action={action} className="space-y-3">
      <HolidayResult state={state} />
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t('date')}>
          <input name="date" type="date" required className={inputClass} />
        </Field>
        <Field label={t('name')}>
          <input name="name" required className={inputClass} />
        </Field>
        <Field label={t('nameBn')}>
          <input name="nameBn" lang="bn" className={inputClass} />
        </Field>
        <Field label={t('kind')}>
          <select name="kind" defaultValue="company" className={inputClass}>
            {HOLIDAY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Check name="isTentative" label={t('isTentative')} defaultChecked={false} />
      </div>
      <SubmitButton variant="secondary">{t('addHoliday')}</SubmitButton>
    </Form>
  );
}

/** A tentative holiday can be confirmed, and moved if the moon sighting changed the date. */
export function HolidayActions({ holiday }: { holiday: HolidayView }) {
  const t = useTranslations('leave.settings');
  const [state, confirm] = useActionState<HolidayState, FormData>(
    confirmHoliday.bind(null, holiday.id),
    undefined,
  );
  const [deleting, startDelete] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {state?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={state} />
        </span>
      )}
      {state?.ok && state.result?.recalculated ? (
        <span className="text-xs text-brand-700">
          {t('recalculated', { count: state.result.recalculated })}
        </span>
      ) : null}
      {holiday.isTentative && (
        <Form state={state} action={confirm} className="flex items-center gap-2">
          <input
            name="date"
            type="date"
            defaultValue={holiday.date}
            className={`${inputClass} w-40 py-1`}
          />
          <button className={buttonClass.secondary}>{t('confirmDate')}</button>
        </Form>
      )}
      <button
        type="button"
        disabled={deleting}
        className={buttonClass.ghost}
        onClick={() => startDelete(() => deleteHoliday(holiday.id))}
      >
        {t('delete')}
      </button>
    </div>
  );
}

export function ImportHolidaysButton({ calendarId, year }: { calendarId: string; year: number }) {
  const t = useTranslations('leave.settings');
  const [state, action] = useActionState<HolidayState, FormData>(
    () => importHolidays(calendarId, year),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-2">
      <HolidayResult state={state} />
      <SubmitButton variant="secondary">{t('import', { year })}</SubmitButton>
    </Form>
  );
}

export function NewCalendarForm() {
  const t = useTranslations('leave.settings');
  const [state, action] = useActionState<ActionState, FormData>(createCalendar, undefined);
  return (
    <Form state={state} action={action} className="flex flex-wrap items-end gap-3">
      <Messages state={state} saved={t('saved')} />
      <Field label={t('newCalendar')}>
        <input name="name" required minLength={2} className={inputClass} />
      </Field>
      <Check name="isDefault" label={t('makeDefault')} defaultChecked={false} />
      <SubmitButton variant="secondary">{t('create')}</SubmitButton>
    </Form>
  );
}

export function LocationCalendarForm({
  location,
  calendars,
}: {
  location: LocationView;
  calendars: HolidayCalendarView[];
}) {
  const t = useTranslations('leave.settings');
  const [state, action] = useActionState<ActionState, FormData>(
    updateLocationCalendar.bind(null, location.id),
    undefined,
  );
  return (
    <Form
      state={state}
      action={action}
      className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]"
    >
      <Field label={t('calendar')}>
        <select
          name="holidayCalendarId"
          defaultValue={location.holidayCalendarId ?? ''}
          className={inputClass}
        >
          <option value="">{t('useDefault')}</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">{t('weeklyOff')}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <Check
              key={d}
              name="weeklyOffDays"
              value={String(d)}
              label={t(`weekdays.${d}`)}
              defaultChecked={location.weeklyOffDays.includes(d)}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        {state?.ok && <span className="text-xs text-brand-700">✓</span>}
        {state?.error && (
          <span className="text-xs text-red-600">
            <ErrorText state={state} />
          </span>
        )}
        <SubmitButton variant="secondary">{t('save')}</SubmitButton>
      </div>
    </Form>
  );
}

export function AdjustLeaveForm({
  employeeId,
  types,
  year,
}: {
  employeeId: string;
  types: LeaveTypeView[];
  year: number;
}) {
  const t = useTranslations('leave.employee');
  const [state, action] = useActionState<ActionState, FormData>(
    adjustLeave.bind(null, employeeId),
    undefined,
  );
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <Form ref={form} state={state} action={action} className="space-y-3">
      <p className="text-sm text-slate-600">{t('adjustHint')}</p>
      <Messages state={state} saved={t('adjust')} />
      <input type="hidden" name="year" value={year} />
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="">
          <select name="leaveTypeId" required className={inputClass}>
            {types
              .filter((x) => x.accrual !== 'per_event')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('kind')}>
          <select name="kind" defaultValue="adjustment" className={inputClass}>
            <option value="adjustment">{t('ledgerKinds.adjustment')}</option>
            <option value="opening">{t('ledgerKinds.opening')}</option>
          </select>
        </Field>
        <Field label={t('days')}>
          <input name="days" type="number" step="0.5" required className={inputClass} />
        </Field>
        <Field label={t('note')}>
          <input name="note" required minLength={3} className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('adjust')}</SubmitButton>
    </Form>
  );
}
