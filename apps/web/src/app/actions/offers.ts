'use server';

import type { OfferHireResult, OfferView, PublicOfferView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { apiFetch, authedFetch } from '@/lib/api';
import { fail, nest, toNumber } from '@/lib/form';
import type { ActionState } from './platform';

const BASE = '/tenant/recruitment/offers';
const PAGES = '/workspace/recruitment';

/** The offer form's fields as the API takes them; empty choices are left out. */
function offerBody(form: FormData) {
  const { probationMonths, ...terms } = nest(form);
  return { ...terms, probationMonths: toNumber(probationMonths) ?? null };
}

export async function createOffer(
  applicationId: string,
  _: ActionState<OfferView>,
  form: FormData,
): Promise<ActionState<OfferView>> {
  const result = await authedFetch<OfferView>('tenant', BASE, {
    method: 'POST',
    body: { ...offerBody(form), applicationId },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function updateOffer(
  id: string,
  _: ActionState<OfferView>,
  form: FormData,
): Promise<ActionState<OfferView>> {
  const result = await authedFetch<OfferView>('tenant', `${BASE}/${id}`, {
    method: 'PATCH',
    body: offerBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/** Submit (approved, or sent for approval above the budget), send, or withdraw. */
export async function moveOffer(
  id: string,
  step: 'submit' | 'send' | 'withdraw',
): Promise<ActionState> {
  const result = await authedFetch<OfferView>('tenant', `${BASE}/${id}/${step}`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

/** The hire form for an accepted offer: what the offer does not know, and where pay goes. */
export async function hireFromOffer(
  id: string,
  _: ActionState<OfferHireResult>,
  form: FormData,
): Promise<ActionState<OfferHireResult>> {
  const {
    sameAsPresent,
    portalEnabled,
    portalAccess,
    pay,
    fullName: _name,
    ...person
  } = nest(form);
  const result = await authedFetch<OfferHireResult>('tenant', `${BASE}/${id}/hire`, {
    method: 'POST',
    body: {
      ...person,
      identity: person.identity ?? {},
      permanentAddress: sameAsPresent ? person.presentAddress : person.permanentAddress,
      portalAccess: portalEnabled ? portalAccess : undefined,
      pay: pay?.structureId ? pay : undefined,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  revalidatePath(PAGES, 'layout');
  return { result: result.data };
}

/** The candidate's answer through their link: no session, only the link. */
export async function answerOffer(
  slug: string,
  token: string,
  answer: 'accept' | 'decline',
  _: ActionState<PublicOfferView>,
  form: FormData,
): Promise<ActionState<PublicOfferView>> {
  const { name, reason, website } = nest(form);
  const path = `/offers/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
  const result = await apiFetch<PublicOfferView>(`${path}/${answer}`, {
    method: 'POST',
    body: answer === 'accept' ? { name, website } : { reason, website },
  });
  if (!result.ok) return fail(result);
  revalidatePath(path);
  return { ok: true, result: result.data };
}
