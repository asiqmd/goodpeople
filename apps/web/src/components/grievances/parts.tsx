import type { GrievanceCategory, GrievanceStatus } from '@gp/shared';
import type { ReactNode } from 'react';
import type { Tone } from '../ui';

// Server-safe pieces shared by the speak-up pages and the staff pages.

export const STATUS_TONE: Record<GrievanceStatus, Tone> = {
  new: 'blue',
  in_review: 'amber',
  responded: 'violet',
  resolved: 'green',
  closed: 'slate',
};

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** A section number such as "33" in the reader's digits. */
export const localDigits = (value: string, locale: string) =>
  locale === 'bn' ? value.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)]!) : value;

const ICONS: Record<GrievanceCategory, ReactNode> = {
  wages: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  hours: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  leave: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  safety: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  harassment: (
    <>
      <path d="M12 3.5l9 16H3z" />
      <path d="M12 10v4.5M12 17h.01" />
    </>
  ),
  discrimination: (
    <path d="M12 4v16M7.5 20h9M5 8h14M5 8l-2.5 6a2.8 2.8 0 0 0 5 0zM19 8l-2.5 6a2.8 2.8 0 0 0 5 0z" />
  ),
  facilities: <path d="M12 3.5c3.5 4.2 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 2.5-6.3 6-10.5z" />,
  other: <path d="M4 5h16v11H9.5L4 20z" />,
};

export function CategoryIcon({
  category,
  className = 'size-7',
}: {
  category: GrievanceCategory;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[category]}
    </svg>
  );
}

export interface ThreadItem {
  key: string;
  /** Written by whoever is reading: shown on the right. */
  own: boolean;
  who: string;
  when: string;
  text: string;
}

export function Thread({ items }: { items: ThreadItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((m) => (
        <li key={m.key} className={`flex ${m.own ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-base ring-1 ring-inset ${
              m.own ? 'bg-brand-50 ring-brand-600/20' : 'bg-white ring-slate-200'
            }`}
          >
            <p className="mb-1 text-xs font-medium text-slate-500">
              {m.who} · {m.when}
            </p>
            <p className="whitespace-pre-wrap break-words text-slate-900">{m.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
