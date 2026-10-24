import { can, MERGE_FIELDS, type LetterTemplateView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LetterTemplateForm } from '@/components/lifecycle/lifecycle-forms';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function LetterTemplatesPage() {
  if (!can((await currentTenantUser())?.role, 'documents.manage')) redirect('/workspace');
  const t = await getTranslations('lifecycle.letters');
  const templates = await load<LetterTemplateView[]>('tenant', '/tenant/letter-templates');
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-slate-600">{t('intro')}</p>
      <div className="grid gap-6 xl:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          {templates.map((tpl) => (
            <details
              key={tpl.id}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{tpl.name}</span>
                <Badge tone="slate">{tpl.language === 'bn' ? 'বাংলা' : 'English'}</Badge>
                {tpl.customized && <Badge tone="violet">{t('customized')}</Badge>}
                {!tpl.isActive && <Badge tone="slate">{t('inactive')}</Badge>}
              </summary>
              <div className="mt-4">
                <LetterTemplateForm template={tpl} />
              </div>
            </details>
          ))}
        </div>
        <Card title={t('fields')} className="h-fit">
          <p className="mb-2 text-xs text-slate-500">{t('fieldsHint')}</p>
          <ul className="space-y-0.5 font-mono text-xs text-slate-700">
            {MERGE_FIELDS.map((f) => (
              <li key={f}>{`{{${f}}}`}</li>
            ))}
            <li className="text-slate-500">{'{{extra.…}}'}</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
