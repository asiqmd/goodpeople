import { requestIdSchema } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpLink } from '@/components/help/help-link';
import { supportRequester } from '@/components/support/parts';
import { NewTicketForm } from '@/components/support/ticket-forms';
import { Card } from '@/components/ui';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** A path inside the app (never another site), as the page the problem happened on. */
const appPath = (from: string | undefined) =>
  from && from.startsWith('/') && !from.startsWith('//') && from.length <= 500 ? from : undefined;

/**
 * A new ticket. Error messages link here with `ref` (the error's reference) and `from` (the
 * page it happened on), which start the form off.
 */
export default async function NewTicketPage({ searchParams }: PageProps<'/workspace/support/new'>) {
  await supportRequester();
  const t = await getTranslations('support.new');
  const query = await searchParams;
  const ref = requestIdSchema.safeParse(one(query.ref));
  return (
    <>
      <div>
        <Link href="/workspace/support" className="text-sm text-slate-600 hover:underline">
          ← {t('back')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {t('title')}
          <HelpLink slug="contact-support" />
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t('intro')}</p>
      </div>
      <Card>
        <NewTicketForm
          requestId={ref.success ? ref.data : undefined}
          pagePath={appPath(one(query.from))}
        />
      </Card>
    </>
  );
}
