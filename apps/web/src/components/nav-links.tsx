'use client';

import { useFormatter } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = {
  href: string;
  label: string;
  badge?: number;
  /** Other paths this link stands for, such as a section's sibling pages. */
  match?: string[];
};

export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const format = useFormatter();
  // The most specific link wins, so /workspace/leave/settings does not also light up "Leave".
  const active = links
    .flatMap((l) => [l.href, ...(l.match ?? [])].map((path) => ({ href: l.href, path })))
    .filter(({ path }) =>
      path === '/workspace'
        ? pathname === path
        : pathname === path || pathname.startsWith(`${path}/`),
    )
    .toSorted((a, b) => b.path.length - a.path.length)[0]?.href;
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === active ? 'page' : undefined}
          className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
            link.href === active
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
          }`}
        >
          {link.label}
          {link.badge ? (
            <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
              {format.number(link.badge)}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
