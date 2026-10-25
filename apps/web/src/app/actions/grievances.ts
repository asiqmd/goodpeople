'use server';

import { asciiDigits, type GrievanceFollowUp, type GrievanceSubmitted } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { apiFetch, authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;
const speakUp = (slug: string, path = '') => `/speak-up/${encodeURIComponent(slug)}${path}`;

// ── Workers, without signing in: no session is read or sent ──────────────────

export async function raiseGrievance(
  slug: string,
  _: ActionState<GrievanceSubmitted>,
  form: FormData,
): Promise<ActionState<GrievanceSubmitted>> {
  const pin = text(form, 'pin');
  // A PIN typed wrong at the start would lock the worker out of their own grievance.
  if (asciiDigits(pin) !== asciiDigits(text(form, 'pinAgain'))) {
    return {
      error: 'The two PINs are not the same',
      code: 'validation_failed',
      issues: [{ path: 'pinAgain', message: 'The two PINs are not the same' }],
    };
  }
  const result = await apiFetch<GrievanceSubmitted>(speakUp(slug, '/grievances'), {
    method: 'POST',
    body: {
      category: optional(form, 'category'),
      text: text(form, 'text'),
      locationId: optional(form, 'locationId'),
      name: optional(form, 'name'),
      employeeCode: optional(form, 'employeeCode'),
      pin,
      channel: text(form, 'channel') === 'kiosk' ? 'kiosk' : 'web',
    },
  });
  if (!result.ok) return fail(result);
  return { ok: true, result: result.data };
}

export async function openGrievance(
  slug: string,
  _: ActionState<GrievanceFollowUp>,
  form: FormData,
): Promise<ActionState<GrievanceFollowUp>> {
  const result = await apiFetch<GrievanceFollowUp>(speakUp(slug, '/follow-up'), {
    method: 'POST',
    body: { reference: text(form, 'reference'), pin: text(form, 'pin') },
  });
  if (!result.ok) return fail(result);
  return { ok: true, result: result.data };
}

export async function replyAsReporter(
  slug: string,
  _: ActionState<GrievanceFollowUp>,
  form: FormData,
): Promise<ActionState<GrievanceFollowUp>> {
  const result = await apiFetch<GrievanceFollowUp>(speakUp(slug, '/replies'), {
    method: 'POST',
    body: {
      reference: text(form, 'reference'),
      pin: text(form, 'pin'),
      text: text(form, 'text'),
    },
  });
  if (!result.ok) return fail(result);
  return { ok: true, result: result.data };
}

// ── Staff ────────────────────────────────────────────────────────────────────

async function staffWrite(id: string, path: string, method: string, body: unknown) {
  const result = await authedFetch('tenant', `/tenant/grievances/${id}${path}`, { method, body });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/grievances', 'layout');
  return { ok: true };
}

export async function answerGrievance(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return staffWrite(id, '/replies', 'POST', { text: text(form, 'text') });
}

export async function setGrievanceStatus(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return staffWrite(id, '', 'PATCH', { status: text(form, 'status') });
}
