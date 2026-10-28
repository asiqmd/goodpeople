import {
  can,
  type EmployeeListItem,
  type OfferHirePrefill,
  type OfferView,
  type OrgSnapshot,
  type Page,
} from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmployeeForm } from '@/components/hr/employee-form';
import { Banner } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hiring, from scratch or (with ?offer=) from an offer the candidate accepted. */
export default async function HirePage({ searchParams }: PageProps<'/workspace/employees/new'>) {
  if (!can((await currentTenantUser())?.role, 'employees.write')) redirect('/workspace/employees');
  const offerId = (await searchParams).offer;
  const fromOffer =
    typeof offerId === 'string' && UUID.test(offerId)
      ? await authedFetch<OfferHirePrefill>('tenant', `/tenant/recruitment/offers/${offerId}/hire`)
      : null;
  const [org, people] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?status=active&pageSize=100'),
  ]);
  const t = await getTranslations('hr.employees');
  const to = await getTranslations('offers.hire');
  const te = await getTranslations('errors');
  const managers = people.items.map((e) => ({
    id: e.id,
    name: `${e.fullName} (${e.employeeCode})`,
  }));
  const offer = fromOffer?.ok ? fromOffer.data : undefined;
  // Saving the hire refreshes this page, after which the offer is (rightly) hired already.
  const hired =
    fromOffer && !fromOffer.ok && fromOffer.error.code === 'already_hired'
      ? await authedFetch<OfferView>('tenant', `/tenant/recruitment/offers/${offerId as string}`)
      : null;
  return (
    <>
      <div>
        <Link href="/workspace/employees" className="text-sm text-slate-500 hover:text-slate-900">
          ← {t('title')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t('hire')}</h1>
        {offer && (
          <p className="mt-1 text-sm text-slate-600">
            {to('fromOffer', { name: offer.offer.candidate.fullName })}{' '}
            <Link
              href={`/workspace/recruitment/applications/${offer.offer.applicationId}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {to('openApplication')}
            </Link>
          </p>
        )}
      </div>
      {hired?.ok ? (
        <Banner tone="green">
          {to('hired', { name: hired.data.candidate.fullName })}{' '}
          <Link
            href={`/workspace/recruitment/applications/${hired.data.applicationId}`}
            className="font-medium underline"
          >
            {to('openApplication')}
          </Link>
        </Banner>
      ) : fromOffer && !fromOffer.ok ? (
        <Banner tone="red">
          {to('cannot')}{' '}
          {fromOffer.error.code && te.has(fromOffer.error.code)
            ? te(fromOffer.error.code)
            : fromOffer.error.message}
        </Banner>
      ) : (
        <EmployeeForm mode="hire" org={org} managers={managers} offer={offer} />
      )}
    </>
  );
}
