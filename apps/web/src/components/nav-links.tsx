'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === '/workspace'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={active(link.href) ? 'page' : undefined}
          className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
            active(link.href)
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
