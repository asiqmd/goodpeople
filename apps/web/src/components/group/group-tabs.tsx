import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

const TABS = [
  ['dashboard', '/workspace/group'],
  ['policies', '/workspace/group/policies'],
] as const;

/** The group's dashboard, and its policies for those who set them. */
export async function GroupTabs({
  active,
  policies,
}: {
  active: (typeof TABS)[number][0];
  policies: boolean;
}) {
  const t = await getTranslations('group.tabs');
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.filter(([tab]) => tab !== 'policies' || policies).map(([tab, href]) => (
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
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}
