import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

const TABS = [
  ['entry', '/workspace/production'],
  ['operations', '/workspace/production/operations'],
  ['summary', '/workspace/production/summary'],
  ['import', '/workspace/production/import'],
] as const;

/** The production pages: daily entry, operations, the month's summary and imports. */
export async function ProductionTabs({ active }: { active: (typeof TABS)[number][0] }) {
  const t = await getTranslations('production');
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([tab, href]) => (
          <Link
            key={tab}
            href={href}
            aria-current={tab === active ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === active
                ? 'border-brand-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {t(`tabs.${tab}`)}
          </Link>
        ))}
      </nav>
    </>
  );
}
