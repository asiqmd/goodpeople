import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { messagesFor, speakUpLocale } from '@/components/grievances/intl';

export const metadata: Metadata = {
  title: 'Speak up',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * Workers' pages, outside the workspace: nothing here reads or sends a session, and the
 * proxy that refreshes sign-ins does not run. Bangla unless the reader chose English.
 */
export default async function SpeakUpLayout({ children }: LayoutProps<'/speak-up'>) {
  const locale = await speakUpLocale();
  return (
    <NextIntlClientProvider locale={locale} messages={await messagesFor(locale)}>
      <div lang={locale}>{children}</div>
    </NextIntlClientProvider>
  );
}
