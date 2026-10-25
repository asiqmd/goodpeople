'use server';

import type { SignupStarted, SlugCheck, TenantSession } from '@gp/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import { writeSessionCookies } from '@/lib/session';

/** Where a sign-up is: the start form, then the code with the workspace address. */
export type SignupState =
  | {
      step: 'start' | 'verify';
      signupId?: string;
      email?: string;
      slug?: string;
      error?: string;
      code?: string;
      issues?: { path: string; message: string }[];
    }
  | undefined;

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export async function startSignup(_: SignupState, form: FormData): Promise<SignupState> {
  const result = await apiFetch<SignupStarted>('/signup', {
    method: 'POST',
    body: {
      name: text(form, 'name'),
      email: text(form, 'email'),
      company: text(form, 'company'),
      industryTemplate: text(form, 'industryTemplate'),
      language: (await getLocale()) === 'bn' ? 'bn' : 'en',
      website: text(form, 'website') || undefined,
    },
  });
  if (!result.ok) return { ...fail(result), step: 'start' };
  return {
    step: 'verify',
    signupId: result.data.signupId,
    email: text(form, 'email'),
    slug: result.data.suggestedSlug,
  };
}

/** Creates the workspace and signs its owner in; where admins need two-step sign-in, to the login. */
export async function verifySignup(_: SignupState, form: FormData): Promise<SignupState> {
  const slug = text(form, 'slug').toLowerCase();
  const signupId = text(form, 'signupId');
  const email = text(form, 'email');
  const result = await apiFetch<{ tenant: { slug: string }; login: TenantSession | object }>(
    '/signup/verify',
    {
      method: 'POST',
      body: {
        signupId,
        code: text(form, 'code'),
        slug,
        password: String(form.get('password') ?? ''),
      },
    },
  );
  if (!result.ok) return { ...fail(result), step: 'verify', signupId, email, slug };
  const { login } = result.data;
  if ('accessToken' in login) {
    writeSessionCookies(await cookies(), 'tenant', login);
    redirect('/workspace/welcome');
  }
  redirect(`/login?created=${encodeURIComponent(result.data.tenant.slug)}`);
}

export async function checkSlug(slug: string): Promise<SlugCheck | null> {
  const result = await apiFetch<SlugCheck>(`/signup/slug?slug=${encodeURIComponent(slug)}`);
  return result.ok ? result.data : null;
}
