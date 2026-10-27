'use client';

import { ErrorPanel } from '@/components/error-panel';
import { Card } from '@/components/ui';

/** A workspace page that failed: the navigation stays, the page says what to do. */
export default function WorkspaceError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Card className="max-w-xl">
      <ErrorPanel error={error} retry={retry} />
    </Card>
  );
}
