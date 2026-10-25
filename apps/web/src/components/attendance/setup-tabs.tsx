import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

const TABS = ['settings', 'roster', 'devices', 'kiosks', 'summary'] as const;

/** Sub-navigation across HR's attendance pages. */
export async function SetupTabs({ active }: { active: (typeof TABS)[number] }) {
  const t = await getTranslations('attendance.setup.tabs');
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((tab) => (
        <Link
          key={tab}
          href={`/workspace/attendance/${tab}`}
          aria-current={tab === active ? 'page' : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
            tab === active
              ? 'border-brand-600 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}
