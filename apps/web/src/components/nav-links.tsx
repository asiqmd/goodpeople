'use client';

import { useFormatter } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ links }: { links: { href: string; label: string; badge?: number }[] }) {
  const pathname = usePathname();
  const format = useFormatter();
  // The most specific link wins, so /workspace/leave/settings does not also light up "Leave".
  const active = links
    .map((l) => l.href)
    .filter((href) =>
      href === '/workspace'
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`),
    )
    .toSorted((a, b) => b.length - a.length)[0];
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
