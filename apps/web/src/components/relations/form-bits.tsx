'use client';

import { useState, useTransition, type ReactNode } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText } from '../forms';
import { Banner, buttonClass } from '../ui';

/** The API's refusal, unless it is already shown next to the fields it names. */
export function Errors({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

export function Saved({ state, children }: { state: ActionState<unknown>; children: ReactNode }) {
  return state?.ok ? <Banner tone="green">{children}</Banner> : null;
}

/** A button that runs one server action, after a confirmation when it cannot be undone. */
export function ActionButton({
  label,
  confirm,
  run,
  className = buttonClass.ghost,
}: {
  label: string;
  confirm?: string;
  run: () => Promise<ActionState>;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setResult(await run()));
        }}
      >
        {label}
      </button>
      {result?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={result} />
        </span>
      )}
    </span>
  );
}
