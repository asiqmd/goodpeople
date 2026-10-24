'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/request';
import { apiFetch } from '@/lib/api';
import { cookieNames } from '@/lib/session';

export async function setLocale(locale: Locale): Promise<void> {
  if (!LOCALES.includes(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
    sameSite: 'lax',
  });
  // A signed-in workspace login also gets its notifications (email, SMS, push) in this language.
  const token = jar.get(cookieNames('tenant').access)?.value;
  if (token) {
    await apiFetch('/account/preferences', { method: 'PATCH', body: { language: locale }, token });
  }
}
