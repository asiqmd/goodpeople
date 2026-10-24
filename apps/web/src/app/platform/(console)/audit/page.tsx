import type { AuditEntry } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { AuditTable } from '@/components/audit-table';
import { Card } from '@/components/ui';
import { load } from '@/lib/api';

export default async function AuditPage() {
  const entries = await load<AuditEntry[]>('platform', '/platform/audit');
  const t = await getTranslations('platform');
  return (
    <Card title={t('audit')}>
      <AuditTable entries={entries} showTenant />
    </Card>
  );
}
