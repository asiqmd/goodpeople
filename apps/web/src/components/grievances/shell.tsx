import type { ReactNode } from 'react';
import { LanguageToggle } from '../forms';

/** A speak-up page: the workspace, the page's title and the language switch, sized for phones. */
export function SpeakUpShell({
  workspace,
  title,
  children,
}: {
  workspace?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-5 px-4 py-5 sm:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          {workspace && <p className="text-sm font-medium text-slate-500">{workspace}</p>}
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        </div>
        {/* Bigger buttons than the workspace's own switch, for fingers on a kiosk. */}
        <div className="shrink-0 [&_button]:px-4 [&_button]:py-2 [&_button]:text-sm">
          <LanguageToggle />
        </div>
      </header>
      {children}
    </main>
  );
}
