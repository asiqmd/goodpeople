'use client';

import {
  APPROVAL_STEP_KINDS,
  SELF_PUNCH_MODES,
  type AttendanceSettingsView,
  type DeviceView,
  type EdgeAgentCreated,
  type EmployeeListItem,
  type LocationView,
  type ShiftView,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useTransition, type ReactNode } from 'react';
import {
  assignShift,
  claimDevicePin,
  clearRoster,
  createAgent,
  createShift,
  reprocessAttendance,
  revokeAgent,
  setRoster,
  updateAttendanceSettings,
  updateDevice,
  updateShift,
} from '@/app/actions/attendance';
import type { ActionState } from '@/app/actions/platform';
import { SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Messages({ state, saved }: { state: ActionState<unknown>; saved: string }) {
  return (
    <>
      {state?.error && (
        <Banner tone="red">
          {state.error}
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

export function AttendanceSettingsForm({ settings }: { settings: AttendanceSettingsView }) {
  const t = useTranslations('attendance.setup');
  const tl = useTranslations('leave');
  const [state, action] = useActionState<ActionState, FormData>(
    updateAttendanceSettings,
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      <Messages state={state} saved={t('saved')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('selfPunch')} hint={t('selfPunchHint')}>
          <select name="selfPunch" defaultValue={settings.selfPunch} className={inputClass}>
            {SELF_PUNCH_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`selfPunchModes.${m}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('window')} hint={t('windowHint')}>
          <input
            name="regularizationWindowDays"
            type="number"
            min={0}
            max={90}
            defaultValue={settings.regularizationWindowDays}
            className={inputClass}
          />
        </Field>
        <Field label={t('trackingFrom')} hint={t('trackingFromHint')}>
          <input
            name="trackingFrom"
            type="date"
            defaultValue={settings.trackingFrom}
            className={inputClass}
          />
        </Field>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-slate-800">{t('chain')}</legend>
        <div className="flex gap-4">
          {APPROVAL_STEP_KINDS.map((k) => (
            <Check
              key={k}
              name="regularizationChain"
              value={k}
              label={tl(`step.${k}`)}
              defaultChecked={settings.regularizationChain.includes(k)}
            />
          ))}
        </div>
        <p className="text-xs text-slate-500">{t('chainHint')}</p>
      </fieldset>
      <Check
        name="requireSelfie"
        label={t('requireSelfie')}
        defaultChecked={settings.requireSelfie}
      />
      <SubmitButton>{t('save')}</SubmitButton>
    </form>
  );
}

/** Creates a shift, or edits one when given. */
export function ShiftForm({ shift }: { shift?: ShiftView }) {
  const t = useTranslations('attendance.setup');
  const [state, action] = useActionState<ActionState, FormData>(
    shift ? updateShift.bind(null, shift.id) : createShift,
    undefined,
  );
  const minutes = (name: keyof ShiftView, label: string, fallback: number, max = 1440) => (
    <Field label={label}>
      <input
        name={name}
        type="number"
        min={0}
        max={max}
        required
        defaultValue={(shift?.[name] as number | undefined) ?? fallback}
        className={inputClass}
      />
    </Field>
  );
  return (
    <form action={action} className="space-y-4">
      <Messages state={state} saved={t('saved')} />
      <div className="grid gap-4 sm:grid-cols-4">
        {!shift && (
          <Field label={t('code')}>
            <input
              name="code"
              required
              maxLength={10}
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
        )}
        <Field label={t('name')}>
          <input name="name" required defaultValue={shift?.name} className={inputClass} />
        </Field>
        <Field label={t('nameBn')}>
          <input name="nameBn" defaultValue={shift?.nameBn ?? ''} className={inputClass} />
        </Field>
        <Field label={t('start')}>
          <input
            name="startTime"
            type="time"
            required
            defaultValue={shift?.startTime ?? '09:00'}
            className={inputClass}
          />
        </Field>
        <Field label={t('end')} hint={t('endHint')}>
          <input
            name="endTime"
            type="time"
            required
            defaultValue={shift?.endTime ?? '18:00'}
            className={inputClass}
          />
        </Field>
        {minutes('breakMinutes', t('break'), 60, 180)}
        {minutes('lateGraceMinutes', t('lateGrace'), 10, 120)}
        {minutes('earlyOutGraceMinutes', t('earlyGrace'), 0, 120)}
        {minutes('halfDayMinutes', t('halfDay'), 240)}
        {minutes('fullDayMinutes', t('fullDay'), 360)}
        {minutes('overtimeMinMinutes', t('otMin'), 30, 240)}
        {minutes('overtimeRoundingMinutes', t('otRounding'), 30, 60)}
      </div>
      <div className="flex flex-wrap gap-6">
        <Check
          name="overtimeEnabled"
          label={t('overtime')}
          defaultChecked={shift?.overtimeEnabled ?? true}
        />
        {!shift?.isDefault && (
          <Check name="isDefault" label={t('makeDefault')} defaultChecked={false} />
        )}
        {shift && !shift.isDefault && (
          <Check name="isActive" label={t('active')} defaultChecked={shift.isActive} />
        )}
        {shift?.isDefault && <input type="hidden" name="isActive" value="on" />}
      </div>
      <SubmitButton>{shift ? t('save') : t('addShift')}</SubmitButton>
    </form>
  );
}

function EmployeePicker({ employees }: { employees: EmployeeListItem[] }) {
  const t = useTranslations('attendance.setup');
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{t('employees')}</legend>
      <div className="mt-1 max-h-56 overflow-y-auto rounded-lg p-2 ring-1 ring-inset ring-slate-300">
        {employees.map((e) => (
          <label key={e.id} className="flex items-center gap-2 py-0.5 text-sm">
            <input type="checkbox" name="employeeIds" value={e.id} />
            <span className="font-mono text-xs text-slate-400">{e.employeeCode}</span>
            {e.fullName}
            {e.location && <span className="text-xs text-slate-500">· {e.location.name}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AssignShiftForm({
  shifts,
  employees,
  today,
}: {
  shifts: ShiftView[];
  employees: EmployeeListItem[];
  today: string;
}) {
  const t = useTranslations('attendance.setup');
  const [state, action] = useActionState<ActionState, FormData>(assignShift, undefined);
  return (
    <form action={action} className="space-y-4">
      <Messages state={state} saved={t('assigned')} />
      <EmployeePicker employees={employees} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('shift')}>
          <select name="shiftId" required className={inputClass}>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.startTime}–{s.endTime}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('from')} hint={t('fromHint')}>
          <input
            name="effectiveFrom"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton>{t('assign')}</SubmitButton>
    </form>
  );
}

const PATTERN_DAYS = 14;

export function RosterForm({
  shifts,
  employees,
  from,
  to,
}: {
  shifts: ShiftView[];
  employees: EmployeeListItem[];
  from: string;
  to: string;
}) {
  const t = useTranslations('attendance.setup');
  const [state, action] = useActionState<ActionState, FormData>(setRoster, undefined);
  const [clearState, clear] = useActionState<ActionState, FormData>(clearRoster, undefined);
  return (
    <form action={action} className="space-y-4">
      <Messages state={state} saved={t('rostered')} />
      <Messages state={clearState} saved={t('cleared')} />
      <EmployeePicker employees={employees} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('from')}>
          <input name="from" type="date" required defaultValue={from} className={inputClass} />
        </Field>
        <Field label={t('to')}>
          <input name="to" type="date" required defaultValue={to} className={inputClass} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">{t('pattern')}</legend>
        <p className="text-xs text-slate-500">{t('patternHint')}</p>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {Array.from({ length: PATTERN_DAYS }, (_, i) => (
            <label key={i} className="text-xs text-slate-500">
              {t('patternDay', { n: i + 1 })}
              <select name="pattern" defaultValue="" className={`${inputClass} mt-0.5`}>
                <option value="">–</option>
                <option value="off">{t('off')}</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-3">
        <SubmitButton>{t('applyRoster')}</SubmitButton>
        <button formAction={clear} formNoValidate className={buttonClass.secondary}>
          {t('clearRoster')}
        </button>
      </div>
    </form>
  );
}

export function NewAgentForm() {
  const t = useTranslations('attendance.devices');
  const [state, action] = useActionState<ActionState<EdgeAgentCreated>, FormData>(
    createAgent,
    undefined,
  );
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <Field label={t('agentName')}>
          <input
            name="name"
            required
            minLength={2}
            placeholder={t('agentNamePlaceholder')}
            className={`${inputClass} w-64`}
          />
        </Field>
        <SubmitButton>{t('addAgent')}</SubmitButton>
      </form>
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.result && (
        <Banner tone="amber">
          <p className="font-medium">{t('tokenOnce')}</p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-900 ring-1 ring-slate-200">
            {state.result.token}
          </code>
          <p className="mt-2 text-xs">{t('tokenHint')}</p>
        </Banner>
      )}
    </div>
  );
}

export function RevokeAgentButton({ id }: { id: string }) {
  const t = useTranslations('attendance.devices');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm font-medium text-red-700 hover:underline"
      onClick={() => {
        if (window.confirm(t('revokeConfirm'))) start(() => revokeAgent(id));
      }}
    >
      {t('revoke')}
    </button>
  );
}

export function DeviceForm({
  device,
  locations,
}: {
  device: DeviceView;
  locations: LocationView[];
}) {
  const t = useTranslations('attendance.devices');
  const [state, action] = useActionState<ActionState, FormData>(
    updateDevice.bind(null, device.id),
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label={t('deviceName')}>
        <input name="name" required defaultValue={device.name} className={`${inputClass} w-56`} />
      </Field>
      <Field label={t('location')}>
        <select
          name="locationId"
          defaultValue={device.location?.id ?? ''}
          className={`${inputClass} w-52`}
        >
          <option value="">–</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="secondary">{t('save')}</SubmitButton>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-xs text-brand-700">{t('saved')}</span>}
    </form>
  );
}

export function ReprocessForm({ from, to }: { from: string; to: string }) {
  const t = useTranslations('attendance.setup');
  const [state, action] = useActionState<ActionState, FormData>(reprocessAttendance, undefined);
  return (
    <form action={action} className="space-y-3">
      <Messages state={state} saved={t('reprocessed')} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('from')}>
          <input name="from" type="date" required defaultValue={from} className={inputClass} />
        </Field>
        <Field label={t('to')}>
          <input name="to" type="date" required defaultValue={to} className={inputClass} />
        </Field>
        <SubmitButton variant="secondary">{t('reprocess')}</SubmitButton>
      </div>
    </form>
  );
}

/** Claims an unmatched device user for an employee by setting their PIN. */
export function ClaimPinForm({ pin, employees }: { pin: string; employees: EmployeeListItem[] }) {
  const t = useTranslations('attendance.devices');
  const [state, action] = useActionState<ActionState<{ linkedPunches: number }>, FormData>(
    claimDevicePin,
    undefined,
  );
  if (state?.result) {
    return (
      <span className="text-xs text-brand-700">
        {t('claimed', { count: state.result.linkedPunches })}
      </span>
    );
  }
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="attendancePin" value={pin} />
      <select
        name="employeeId"
        required
        defaultValue=""
        className={`${inputClass} w-56 py-1 text-xs`}
      >
        <option value="" disabled>
          {t('claimAs')}
        </option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.employeeCode} · {e.fullName}
          </option>
        ))}
      </select>
      <SubmitButton variant="secondary">{t('claim')}</SubmitButton>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
