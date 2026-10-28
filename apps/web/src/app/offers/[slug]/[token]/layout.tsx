import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { messagesFor } from '@/components/grievances/intl';
import { loadPublicOffer, offerLocale } from '@/components/recruitment/offer-public';

export const metadata: Metadata = {
  title: 'Job offer',
  robots: { index: false, follow: false },
  // The link is the candidate's key: it must never leave in a Referer header.
  referrer: 'no-referrer',
};

/**
 * A candidate's offer, outside the workspace: no session is read or sent. In the offer's
 * language unless the reader chose another with the toggle.
 */
export default async function OfferLayout({
  children,
  params,
}: LayoutProps<'/offers/[slug]/[token]'>) {
  const { slug, token } = await params;
  const offer = await loadPublicOffer(slug, token);
  const locale = await offerLocale(offer.ok ? offer.data.language : undefined);
  return (
    <NextIntlClientProvider locale={locale} messages={await messagesFor(locale)}>
      <div lang={locale}>{children}</div>
    </NextIntlClientProvider>
  );
}
