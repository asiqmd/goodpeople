import { can, todayIn, type CommitteeMemberView, type CommitteeView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import {
  CommitteeEditForm,
  DecisionToggle,
  DeleteCommitteeButton,
  EndMemberForm,
  MeetingForm,
  MemberForm,
} from '@/components/relations/committee-forms';
import {
  CheckList,
  EstablishmentName,
  RelationsNav,
  RuleRef,
} from '@/components/relations/relations-views';
import { Badge, Banner, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function CommitteePage({
  params,
}: PageProps<'/workspace/compliance/committees/[id]'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'compliance.manage')) redirect('/workspace');
  const { id } = await params;
  const t = await getTranslations('relations');
  const tc = await getTranslations('relations.committee');
  const format = await getFormatter();
  const committee = await load<CommitteeView>('tenant', `/tenant/relations/committees/${id}`);
  const today = todayIn();
  const current = committee.memberList.filter((m) => m.current);
  const past = committee.memberList.filter((m) => !m.current);

  const memberRow = (m: CommitteeMemberView, active: boolean) => (
    <tr key={m.id}>
      <td className="px-5 py-2">
        <span className="font-medium text-slate-900">{m.name}</span>{' '}
        <span className="font-mono text-xs text-slate-400">
          {m.employee?.employeeCode ?? tc('outsider')}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-700">{t(`genders.${m.gender ?? 'unknown'}`)}</td>
      <td className="px-3 py-2 text-slate-700">{t(`sides.${m.side}`)}</td>
      <td className="px-3 py-2 text-slate-700">{t(`roles.${m.role}`)}</td>
      <td className="px-3 py-2 text-slate-700">{t(`selections.${m.selection}`)}</td>
      <td className="px-3 py-2 text-slate-700">
        {day(format, m.fromOn)}
        {m.toOn && ` – ${day(format, m.toOn)}`}
      </td>
      <td className="px-5 py-2">
        {active && <EndMemberForm committeeId={committee.id} memberId={m.id} today={today} />}
      </td>
    </tr>
  );
  const memberTable = (members: CommitteeMemberView[], active: boolean) => (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-2 font-medium">{tc('memberColumns.name')}</th>
            <th className="px-3 py-2 font-medium">{tc('memberColumns.gender')}</th>
            <th className="px-3 py-2 font-medium">{tc('memberColumns.side')}</th>
            <th className="px-3 py-2 font-medium">{tc('memberColumns.role')}</th>
            <th className="px-3 py-2 font-medium">{tc('memberColumns.selection')}</th>
            <th className="px-3 py-2 font-medium">{tc('memberColumns.from')}</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {members.map((m) => memberRow(m, active))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="space-y-3">
        <RelationsNav current="committees" />
        <Link
          href="/workspace/compliance/committees"
          className="block text-sm font-medium text-brand-700 hover:underline"
        >
          ← {tc('back')}
        </Link>
        <h1 className="text-2xl font-semibold">{committee.name}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge tone="violet">{t(`kinds.${committee.kind}`)}</Badge>
          <EstablishmentName of={committee} />
          <span>· {tc('formed', { date: day(format, committee.formedOn) })}</span>
          <span>
            ·{' '}
            {committee.endsOn ? tc('term', { date: day(format, committee.endsOn) }) : tc('noTerm')}
          </span>
        </p>
      </div>

      {committee.kind === 'participation' && <Banner tone="blue">{tc('transferNote')}</Banner>}

      <Card title={tc('checks')} action={<RuleRef rule={committee.rule} />}>
        <p className="mb-3 text-xs text-slate-500">
          {tc('workforce', { count: committee.workforce })}
        </p>
        {committee.checks.length ? (
          <CheckList checks={committee.checks} />
        ) : (
          <p className="text-sm text-slate-500">{tc('noChecks')}</p>
        )}
      </Card>

      <Card title={tc('members')}>
        <div className="space-y-5">
          {current.length ? (
            memberTable(current, true)
          ) : (
            <p className="text-sm text-slate-500">{tc('noMembers')}</p>
          )}
          {past.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                {tc('past', { count: past.length })}
              </summary>
              <div className="mt-2">{memberTable(past, false)}</div>
            </details>
          )}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{tc('addMember')}</h3>
            <MemberForm committeeId={committee.id} today={today} />
          </div>
        </div>
      </Card>

      <Card title={tc('meetings')}>
        <div className="space-y-5">
          {committee.meetings.length === 0 ? (
            <p className="text-sm text-slate-500">{tc('noMeetings')}</p>
          ) : (
            <ul className="-mx-5 divide-y divide-slate-100">
              {committee.meetings.map((m) => (
                <li key={m.id} className="space-y-3 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{day(format, m.heldOn)}</span>
                    {m.attendees !== null && (
                      <span className="text-slate-500">
                        · {tc('attendeesCount', { count: m.attendees })}
                      </span>
                    )}
                    <span className="text-slate-500">
                      ·{' '}
                      {m.minutesSentOn
                        ? tc('minutesSent', { date: day(format, m.minutesSentOn) })
                        : m.minutesDueOn
                          ? tc('minutesDue', { date: day(format, m.minutesDueOn) })
                          : null}
                    </span>
                    {m.minutesLate && <Badge tone="red">{tc('late')}</Badge>}
                  </div>
                  {m.agenda && (
                    <p className="whitespace-pre-line text-slate-700">
                      <span className="font-medium">{tc('agenda')}:</span> {m.agenda}
                    </p>
                  )}
                  {m.minutes && (
                    <p className="whitespace-pre-line text-slate-700">
                      <span className="font-medium">{tc('minutes')}:</span> {m.minutes}
                    </p>
                  )}
                  {m.decisions.length > 0 && (
                    <div>
                      <p className="font-medium text-slate-800">{tc('decisions')}</p>
                      <ul className="mt-1 space-y-1">
                        {m.decisions.map((d, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2">
                            <Badge
                              tone={d.done ? 'green' : d.dueOn && d.dueOn < today ? 'red' : 'amber'}
                            >
                              {d.done ? tc('done') : tc('open')}
                            </Badge>
                            <span
                              className={d.done ? 'text-slate-500 line-through' : 'text-slate-800'}
                            >
                              {d.text}
                            </span>
                            {d.dueOn && (
                              <span className="text-xs text-slate-500">
                                {tc('dueBy', { date: day(format, d.dueOn) })}
                              </span>
                            )}
                            <DecisionToggle
                              committeeId={committee.id}
                              meetingId={m.id}
                              index={i}
                              done={d.done}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-brand-700">
                      {t('edit')}
                    </summary>
                    <div className="mt-3 rounded-lg bg-slate-50 p-4">
                      <MeetingForm committeeId={committee.id} meeting={m} today={today} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{tc('recordTitle')}</h3>
            <MeetingForm committeeId={committee.id} today={today} />
          </div>
        </div>
      </Card>

      <Card title={tc('details')}>
        <div className="space-y-4">
          <CommitteeEditForm committee={committee} />
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <DeleteCommitteeButton id={committee.id} />
            <span className="text-xs text-slate-500">{tc('deleteHint')}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
