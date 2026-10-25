import 'server-only';
import { createTranslator } from 'next-intl';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale } from '@/i18n/request';

/** Workers read the speak-up pages in Bangla unless they chose English. */
export async function speakUpLocale(): Promise<Locale> {
  return (await cookies()).get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'bn';
}

/** A language's messages, untyped: the app does not declare its message keys. */
export async function messagesFor(locale: Locale): Promise<Record<string, any>> {
  return (await import(`../../../messages/${locale}.json`)).default;
}

/** Translations in a given language, whatever the reader's own (the poster has both). */
export async function intlFor(locale: Locale) {
  const messages = await messagesFor(locale);
  return { locale, t: createTranslator({ locale, messages, namespace: 'grievances' }) };
}
