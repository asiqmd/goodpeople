import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['en', 'bn', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'gp_locale';

// No locale in the URL: the choice lives in a cookie, set by the language toggle.
export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = stored === 'ar' ? 'ar' : stored === 'bn' ? 'bn' : 'en';
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
