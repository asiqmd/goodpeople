import 'server-only';
import type { PublicOfferView } from '@gp/shared';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { LOCALE_COOKIE, type Locale } from '@/i18n/request';
import { apiFetch } from '@/lib/api';

/** The offer behind a candidate's link, read once per request by the layout and the page. */
export const loadPublicOffer = cache((slug: string, token: string) =>
  apiFetch<PublicOfferView>(`/offers/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
);

/** The language the reader chose with the toggle, else the offer's own. */
export async function offerLocale(language: Locale | undefined): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  return chosen === 'en' || chosen === 'bn' ? chosen : (language ?? 'en');
}
