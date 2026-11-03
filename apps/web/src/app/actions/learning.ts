'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows } from '@/lib/form';
import type { ActionState } from './platform';
export type LearningAction =
  | 'course'
  | 'session'
  | 'requirement'
  | 'drill'
  | 'enrol'
  | 'withdraw'
  | 'attendance'
  | 'cancel'
  | 'revoke'
  | 'void'
  | 'retire'
  | 'archive';
const base = '/workspace/learning';
const time = (v: string) => `${v.length === 16 ? v + ':00' : v}+06:00`;
export async function saveLearning(
  kind: LearningAction,
  id: string | undefined,
  _: ActionState<unknown>,
  form: FormData,
): Promise<ActionState<unknown>> {
  const d = nest(form);
  let path: string;
  let body: unknown;
  let method = 'POST';
  switch (kind) {
    case 'course':
      path = '/courses';
      body = { ...d, validityMonths: d.validityMonths ? Number(d.validityMonths) : null };
      break;
    case 'session':
      path = '/sessions';
      body = {
        ...d,
        locationId: d.locationId || null,
        capacity: Number(d.capacity),
        startsAt: time(d.startsAt),
        endsAt: time(d.endsAt),
      };
      break;
    case 'requirement':
      path = '/requirements';
      body = { ...d, graceDays: Number(d.graceDays ?? 0), effectiveTo: d.effectiveTo || null };
      break;
    case 'drill':
      path = '/drills';
      body = {
        ...d,
        participants: Number(d.participants),
        evacuationSeconds: Number(d.evacuationSeconds),
      };
      break;
    case 'enrol':
      path = `/sessions/${id}/enrol`;
      body = d.employeeCode ? { employeeCode: d.employeeCode } : {};
      break;
    case 'withdraw':
      path = `/sessions/${id}/withdraw`;
      body = d.employeeId ? { employeeId: d.employeeId } : {};
      break;
    case 'attendance':
      path = `/sessions/${id}/complete`;
      body = { attendance: rows(d.attendance), note: d.note };
      break;
    case 'cancel':
      path = `/sessions/${id}/cancel`;
      body = { reason: d.reason };
      break;
    case 'revoke':
      path = `/certificates/${id}/revoke`;
      body = { reason: d.reason };
      break;
    case 'void':
      path = `/drills/${id}/void`;
      body = { reason: d.reason };
      break;
    case 'retire':
      path = `/requirements/${id}/retire`;
      body = { effectiveTo: d.effectiveTo, reason: d.reason };
      break;
    case 'archive':
      path = `/courses/${id}`;
      method = 'PATCH';
      body = { isActive: d.isActive === 'true' };
      break;
    default:
      throw new Error('Unknown learning action');
  }
  const result = await authedFetch<{ id?: string }>('tenant', `/tenant/learning${path}`, {
    method,
    body,
  });
  if (!result.ok) return fail(result);
  revalidatePath(base, 'layout');
  revalidatePath('/workspace/compliance/audit');
  if (kind === 'session' && result.data?.id) redirect(`${base}/sessions/${result.data.id}`);
  return { ok: true, result: result.data };
}
