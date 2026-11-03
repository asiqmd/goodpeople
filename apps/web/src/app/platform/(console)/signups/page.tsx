import type { SignupView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import { load } from '@/lib/api';

const TONE = { code_sent: 'blue', workspace_created: 'green', expired: 'slate' } as const;

/** Self-serve sign-ups, newest first: who started, and how far they got. */
export default async function SignupsPage() {
  const signups = await load<SignupView[]>('platform', '/platform/signups');
  const t = await getTranslations('platform.signups');
  const ti = await getTranslations('industries');
  const format = await getFormatter();
  const created = signups.filter((s) => s.stage === 'workspace_created').length;
  return (
    <Card
      title={t('title')}
      action={
        <span className="text-sm text-slate-600">
          {t('funnel', { started: signups.length, created })}
        </span>
      }
    >
      {signups.length === 0 ? (
        <p className="text-sm text-slate-500">{t('none')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">{t('when')}</th>
                <th className="px-5 py-2 font-medium">{t('company')}</th>
                <th className="px-5 py-2 font-medium">{t('person')}</th>
                <th className="px-5 py-2 font-medium">{t('industry')}</th>
                <th className="px-5 py-2 font-medium">{t('stage')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {signups.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-2.5 text-slate-600">
                    {format.dateTime(new Date(s.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {s.termsVersion && (
                      <span className="block text-xs text-slate-500">
                        {t('terms', { version: s.termsVersion })}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 font-medium">{s.company}</td>
                  <td className="px-5 py-2.5">
                    {s.name}
                    <span className="block text-xs text-slate-500">{s.email}</span>
                  </td>
                  <td className="px-5 py-2.5 text-slate-600">{ti(s.industryTemplate)}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone={TONE[s.stage]}>{t(`stages.${s.stage}`)}</Badge>
                    {s.tenant && (
                      <Link
                        href={`/platform/tenants/${s.tenant.id}`}
                        className="ms-2 font-mono text-xs text-brand-700 hover:underline"
                      >
                        {s.tenant.slug}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
