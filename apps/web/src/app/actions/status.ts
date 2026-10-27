'use server';

import type { IncidentView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAGE = '/platform/status';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;

/**
 * A datetime-local value is a wall-clock time without a zone; the console means Dhaka. Left
 * as typed when it is not a time, so the API's check names the field.
 */
const fromDhaka = (value: string | undefined) => {
  if (!value) return undefined;
  const at = new Date(`${value.length === 16 ? `${value}:00` : value}+06:00`);
  return Number.isNaN(at.getTime()) ? value : at.toISOString();
};

export async function createIncident(
  _: ActionState<IncidentView>,
  form: FormData,
): Promise<ActionState<IncidentView>> {
  const kind = text(form, 'kind');
  const result = await authedFetch<IncidentView>('platform', '/platform/status/incidents', {
    method: 'POST',
    body: {
      kind,
      titleEn: text(form, 'titleEn'),
      titleBn: text(form, 'titleBn'),
      impact: kind === 'incident' ? optional(form, 'impact') : undefined,
      components: form.getAll('components').map(String),
      status: text(form, 'status'),
      startsAt: fromDhaka(optional(form, 'startsAt')),
      endsAt: kind === 'maintenance' ? fromDhaka(optional(form, 'endsAt')) : undefined,
      bodyEn: text(form, 'bodyEn'),
      bodyBn: text(form, 'bodyBn'),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGE);
  return { ok: true, result: result.data };
}

export async function postIncidentUpdate(
  id: string,
  _: ActionState<IncidentView>,
  form: FormData,
): Promise<ActionState<IncidentView>> {
  const result = await authedFetch<IncidentView>(
    'platform',
    `/platform/status/incidents/${id}/updates`,
    {
      method: 'POST',
      body: {
        status: text(form, 'status'),
        impact: optional(form, 'impact'),
        bodyEn: text(form, 'bodyEn'),
        bodyBn: text(form, 'bodyBn'),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGE);
  return { ok: true, result: result.data };
}
