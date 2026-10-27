'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ErrorPanel } from '@/components/error-panel';
import { buttonClass, Logo } from '@/components/ui';

/** A page that failed anywhere but inside the workspace (including the workspace's layout). */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('common');
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <Logo />
      <ErrorPanel error={error} retry={retry}>
        <Link href="/" className={buttonClass.secondary}>
          {t('goHome')}
        </Link>
      </ErrorPanel>
    </main>
  );
}
