import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageToggle } from '../forms';
import { Logo } from '../ui';

/** Where people (and payment gateways' reviewers) reach us; set per installation. */
export const supportEmail = () => process.env.GP_SUPPORT_EMAIL || 'support@goodpeople.example';

/** The help centre's and legal pages' header, like the home page's. */
export async function SiteHeader() {
  const t = await getTranslations('help');
  const th = await getTranslations('home');
  return (
    <header className="flex items-center justify-between gap-4">
      <Link href="/">
        <Logo />
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/help" className="font-medium text-slate-600 hover:text-slate-900">
          {t('link')}
        </Link>
        <Link href="/pricing" className="font-medium text-slate-600 hover:text-slate-900">
          {th('pricing')}
        </Link>
        <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
          {th('signIn')}
        </Link>
        <LanguageToggle />
      </nav>
    </header>
  );
}

/**
 * The public pages' footer: help, status, prices and the legal pages, with a contact address.
 * Card gateways (SSLCommerz) require the terms, privacy and refund policies and a way to
 * contact the merchant to be visible on the site.
 */
export async function SiteFooter({ children }: { children?: ReactNode }) {
  const t = await getTranslations('help.footer');
  const tc = await getTranslations('common');
  const email = supportEmail();
  const links = [
    { href: '/help', label: t('help') },
    { href: '/status', label: t('status') },
    { href: '/pricing', label: t('pricing') },
    { href: '/legal/terms', label: t('terms') },
    { href: '/legal/privacy', label: t('privacy') },
    { href: '/legal/refunds', label: t('refunds') },
    { href: '/legal/dpa', label: t('dpa') },
  ];
  return (
    <footer className="mt-auto pt-16 text-sm text-slate-500">
      <div className="border-t border-slate-200 pt-6">
        <nav aria-label={t('label')} className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-slate-800">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p>
            {tc('appName')} · {t('contact')}{' '}
            <a href={`mailto:${email}`} className="font-medium text-slate-700 hover:underline">
              {email}
            </a>
          </p>
          {children}
        </div>
      </div>
    </footer>
  );
}
