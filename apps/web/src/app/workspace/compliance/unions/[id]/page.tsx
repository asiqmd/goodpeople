import { can, todayIn, type TradeUnionView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { taka } from '@/components/payroll/payroll-views';
import { RelationsNav, RuleRef } from '@/components/relations/relations-views';
import {
  BulkMembersForm,
  ConsentForm,
  DeleteUnionButton,
  EndUnionMemberForm,
  UnionEditForm,
  UnionMemberForm,
} from '@/components/relations/union-forms';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function UnionPage({
  params,
}: PageProps<'/workspace/compliance/unions/[id]'>) {
  const accessPrincipal = await currentTenantUser();
  if (!can(accessPrincipal, 'compliance.manage')) redirect('/workspace');
  const { id } = await params;
  const t = await getTranslations('relations');
  const tu = await getTranslations('relations.union');
  const tl = await getTranslations('relations.unions');
  const format = await getFormatter();
  const union = await load<TradeUnionView>('tenant', `/tenant/relations/unions/${id}`);
  const today = todayIn();
  const { threshold } = union;

  return (
    <>
      <div className="space-y-3">
        <RelationsNav current="unions" />
        <Link
          href="/workspace/compliance/unions"
          className="block text-sm font-medium text-brand-700 hover:underline"
        >
          ← {tu('back')}
        </Link>
        <h1 className="text-2xl font-semibold">{union.name}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {union.isCba && <Badge tone="violet">{tl('cba')}</Badge>}
          {union.checkOff && union.monthlySubscription && (
            <Badge tone="blue">
              {tl('checkOff')} ·{' '}
              {tl('perMonth', { amount: taka(format, union.monthlySubscription) })}
            </Badge>
          )}
          <span>{union.legalEntity.name}</span>
          <span>
            ·{' '}
            {union.registrationNo
              ? tu('registration', { number: union.registrationNo })
              : tu('unregistered')}
            {union.registeredOn &&
              ` (${tu('registeredOn', { date: day(format, union.registeredOn) })})`}
          </span>
          {union.federation && <span>· {union.federation}</span>}
        </p>
        {union.checkOff && (
          <Link
            href={`/workspace/compliance/unions?unionId=${union.id}`}
            className="inline-block text-sm font-medium text-brand-700 hover:underline"
          >
            {tu('checkOffLink')}
          </Link>
        )}
      </div>

      <Card title={tu('thresholdTitle')} action={<RuleRef rule={threshold.rule} />}>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <Badge tone={threshold.ok ? 'green' : 'amber'}>
            {t(threshold.ok ? 'results.ok' : 'results.fail')}
          </Badge>
          {tu('thresholdText', {
            required: threshold.required,
            workers: threshold.workers,
            members: threshold.members,
          })}
        </p>
      </Card>

      <Card title={tu('members')}>
        <div className="space-y-5">
          {union.memberList.length === 0 ? (
            <p className="text-sm text-slate-500">{tu('noMembers')}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">{tu('memberColumns.member')}</th>
                    <th className="px-3 py-2 font-medium">{tu('memberColumns.role')}</th>
                    <th className="px-3 py-2 font-medium">{tu('memberColumns.joined')}</th>
                    <th className="px-3 py-2 font-medium">{tu('memberColumns.consent')}</th>
                    <th className="px-5 py-2 font-medium">{tu('memberColumns.left')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {union.memberList.map((m) => (
                    <tr key={m.id} className={m.current ? '' : 'text-slate-500'}>
                      <td className="px-5 py-2">
                        <span className="font-medium">{m.employee.fullName}</span>{' '}
                        <span className="font-mono text-xs text-slate-400">
                          {m.employee.employeeCode}
                        </span>
                      </td>
                      <td className="px-3 py-2">{t(`unionRoles.${m.role}`)}</td>
                      <td className="px-3 py-2">{day(format, m.joinedOn)}</td>
                      <td className="px-3 py-2">
                        {m.current ? (
                          <ConsentForm unionId={union.id} member={m} />
                        ) : m.checkOffConsentOn ? (
                          day(format, m.checkOffConsentOn)
                        ) : (
                          tu('paysDirectly')
                        )}
                      </td>
                      <td className="px-5 py-2">
                        {m.leftOn ? (
                          day(format, m.leftOn)
                        ) : (
                          <EndUnionMemberForm unionId={union.id} memberId={m.id} today={today} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{tu('addMember')}</h3>
            <UnionMemberForm unionId={union.id} today={today} />
          </div>
          <details className="border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              {tu('bulk')}
            </summary>
            <div className="mt-3">
              <BulkMembersForm unionId={union.id} today={today} />
            </div>
          </details>
        </div>
      </Card>

      <Card title={tu('details')}>
        <div className="space-y-4">
          <UnionEditForm union={union} />
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <DeleteUnionButton id={union.id} />
            <span className="text-xs text-slate-500">{tu('deleteHint')}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
