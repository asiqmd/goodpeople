'use server';

import type { ApiError, CareersApplied } from '@gp/shared';
import { getLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { API_URL } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

/** What the form sends on, by name; the CV goes as the file `cv`. */
const FIELDS = ['fullName', 'email', 'phone', 'coverNote', 'consent', 'talentPool', 'website'];

/**
 * Applies from the careers page, without a session: the form's fields and the CV are sent on
 * as multipart, with the visitor's address so the API's limits count each applicant.
 */
export async function applyForJob(
  slug: string,
  openingId: string,
  _: ActionState<CareersApplied>,
  form: FormData,
): Promise<ActionState<CareersApplied>> {
  const body = new FormData();
  for (const name of FIELDS) {
    const value = form.get(name);
    if (typeof value === 'string' && value.trim()) body.set(name, value.trim());
  }
  body.set('language', (await getLocale()) === 'bn' ? 'bn' : 'en');
  const cv = form.get('cv');
  if (cv instanceof File && cv.size > 0) body.set('cv', cv, cv.name);

  const forwarded = (await headers()).get('x-forwarded-for');
  const visitor = forwarded?.split(',').at(-1)?.trim();
  const res = await fetch(
    `${API_URL}/careers/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(openingId)}/apply`,
    {
      method: 'POST',
      headers: visitor ? { 'x-forwarded-for': visitor } : {},
      body,
      cache: 'no-store',
    },
  );
  if (res.ok) return { ok: true, result: (await res.json()) as CareersApplied };
  const error: ApiError = {
    statusCode: res.status,
    error: res.statusText,
    message: 'Request failed',
    requestId: res.headers.get('x-request-id') ?? undefined,
    ...(await res.json().catch(() => ({}))),
  };
  return fail({ error });
}
