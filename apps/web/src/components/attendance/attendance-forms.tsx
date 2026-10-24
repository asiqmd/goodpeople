'use client';

import type { RegularizationKind, RegularizationView, SelfPunchMode } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState, useTransition } from 'react';
import {
  addManualPunch,
  cancelRegularization,
  punch,
  punchWithSelfie,
  requestRegularization,
  setAttendancePin,
  voidPunch,
  type PunchState,
} from '@/app/actions/attendance';
import type { ActionState } from '@/app/actions/platform';
import { SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

/** Error codes the API gives a punch, each with its own explanation. */
const PUNCH_ERRORS = [
  'outside_geofence',
  'location_required',
  'no_geofence',
  'self_punch_disabled',
  'too_soon',
  'separated',
  'location_denied',
  'selfie_required',
] as const;

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 30_000,
    }),
  );
}

/** A camera photo shrunk to at most 1024 px as a JPEG, well under the API's 2 MB limit. */
async function shrink(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/jpeg', 0.75),
  );
}

/**
 * Punch in or out from the browser. The position goes with it so the API can check the
 * geofence; where the workspace allows punching anywhere, a refused position is fine. When
 * a selfie is required, the button opens the camera first.
 */
export function PunchButton({
  direction,
  mode,
  requireSelfie,
}: {
  direction: 'in' | 'out';
  mode: SelfPunchMode;
  requireSelfie: boolean;
}) {
  const t = useTranslations('attendance.punch');
  const [state, setState] = useState<PunchState>();
  const [pending, start] = useTransition();
  const camera = useRef<HTMLInputElement>(null);

  const go = (selfie?: File) =>
    start(async () => {
      let coords: { latitude?: number; longitude?: number; accuracyM?: number } = {};
      try {
        const p = await position();
        coords = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracyM: Math.round(p.coords.accuracy),
        };
      } catch {
        if (mode === 'geofenced') {
          setState({ code: 'location_denied' });
          return;
        }
      }
      if (!selfie) {
        setState(await punch(coords));
        return;
      }
      const form = new FormData();
      form.set('source', 'web');
      for (const [key, value] of Object.entries(coords)) form.set(key, String(value));
      form.set('selfie', await shrink(selfie), 'selfie.jpg');
      setState(await punchWithSelfie(form));
    });

  const known = state?.code && (PUNCH_ERRORS as readonly string[]).includes(state.code);
  return (
    <div className="space-y-3">
      {requireSelfie && (
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) go(file);
          }}
        />
      )}
      <button
        type="button"
        onClick={() => (requireSelfie ? camera.current?.click() : go())}
        disabled={pending}
        className={`${buttonClass.primary} px-6 py-3 text-base`}
      >
        {pending ? t('locating') : direction === 'in' ? t('in') : t('out')}
      </button>
      {requireSelfie && <p className="text-xs text-slate-500">{t('selfieHint')}</p>}
      {state?.ok && <Banner tone="green">{t('done')}</Banner>}
      {(state?.code || state?.error) && (
        <Banner tone="red">
          {known ? t(`errors.${state.code as (typeof PUNCH_ERRORS)[number]}`) : state.error}
          {state.code === 'outside_geofence' && state.error && (
            <span className="block text-xs">{state.error}</span>
          )}
        </Banner>
      )}
    </div>
  );
}

export function RegularizationForm({ date, maxDate }: { date: string; maxDate: string }) {
  const t = useTranslations('attendance.correction');
  const [state, action] = useActionState<ActionState<RegularizationView>, FormData>(
    requestRegularization,
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.result && <Banner tone="green">{t('sent')}</Banner>}
      {/* A new key after each request starts the fields afresh. */}
      <CorrectionFields key={state?.result?.id ?? date} date={date} maxDate={maxDate} />
    </form>
  );
}

function CorrectionFields({ date, maxDate }: { date: string; maxDate: string }) {
  const t = useTranslations('attendance.correction');
  const [kind, setKind] = useState<RegularizationKind>('missed_punch');
  return (
    <>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        {(['missed_punch', 'on_duty'] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {t(`kinds.${k}`)}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('date')}>
          <input
            name="date"
            type="date"
            required
            defaultValue={date}
            max={maxDate}
            className={inputClass}
          />
        </Field>
        {kind === 'missed_punch' && (
          <>
            <Field label={t('inTime')}>
              <input name="inTime" type="time" className={inputClass} />
            </Field>
            <Field label={t('outTime')} hint={t('outHint')}>
              <input name="outTime" type="time" className={inputClass} />
            </Field>
          </>
        )}
      </div>
      <Field label={t('reason')}>
        <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
      </Field>
      <SubmitButton>{t('submit')}</SubmitButton>
    </>
  );
}

export function CancelRegularizationButton({ id }: { id: string }) {
  const t = useTranslations('attendance.correction');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass.ghost}
      onClick={() => {
        if (window.confirm(t('cancelConfirm'))) start(() => cancelRegularization(id));
      }}
    >
      {t('cancel')}
    </button>
  );
}

// ── HR, for one employee ─────────────────────────────────────────────────────

export function PinForm({ employeeId, pin }: { employeeId: string; pin: string | null }) {
  const t = useTranslations('attendance.employee');
  const [state, action] = useActionState<ActionState<{ linkedPunches: number }>, FormData>(
    setAttendancePin.bind(null, employeeId),
    undefined,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label={t('pin')} hint={t('pinHint')}>
        <input
          name="attendancePin"
          defaultValue={pin ?? ''}
          maxLength={24}
          className={`${inputClass} w-40 font-mono`}
        />
      </Field>
      <SubmitButton variant="secondary">{t('savePin')}</SubmitButton>
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.result && (
        <Banner tone="green">{t('pinSaved', { count: state.result.linkedPunches })}</Banner>
      )}
    </form>
  );
}

export function ManualPunchForm({ employeeId, maxDate }: { employeeId: string; maxDate: string }) {
  const t = useTranslations('attendance.employee');
  const [state, action] = useActionState<ActionState, FormData>(
    addManualPunch.bind(null, employeeId),
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">{t('punchAdded')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('date')}>
          <input name="date" type="date" required max={maxDate} className={inputClass} />
        </Field>
        <Field label={t('time')}>
          <input name="time" type="time" required className={inputClass} />
        </Field>
      </div>
      <Field label={t('reason')}>
        <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('addPunch')}</SubmitButton>
    </form>
  );
}

export function VoidPunchForm({ punchId }: { punchId: string }) {
  const t = useTranslations('attendance.employee');
  const [state, action] = useActionState<ActionState, FormData>(
    voidPunch.bind(null, punchId),
    undefined,
  );
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-900">{t('void')}</summary>
      <form action={action} className="mt-2 flex items-center gap-2">
        <input
          name="reason"
          required
          minLength={3}
          placeholder={t('voidReason')}
          className={`${inputClass} w-56`}
        />
        <SubmitButton variant="secondary">{t('void')}</SubmitButton>
      </form>
      {state?.error && <p className="mt-1 text-red-600">{state.error}</p>}
    </details>
  );
}
