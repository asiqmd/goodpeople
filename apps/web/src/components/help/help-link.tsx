import { useTranslations } from 'next-intl';

/** A small "Help" link to the help centre's article about the page it sits on. */
export function HelpLink({ slug }: { slug: string }) {
  const t = useTranslations('help');
  return (
    <a
      href={`/help/${slug}`}
      target="_blank"
      rel="noopener"
      title={t('linkTitle')}
      className="ml-3 inline-flex items-center gap-1 align-middle text-sm font-medium text-slate-500 hover:text-brand-700"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-4"
      >
        <circle cx="12" cy="12" r="9" />
        <path
          d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.7-2.5 2.2-2.5 3.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 17.2h.01" strokeLinecap="round" strokeWidth="2.4" />
      </svg>
      {t('link')}
    </a>
  );
}
