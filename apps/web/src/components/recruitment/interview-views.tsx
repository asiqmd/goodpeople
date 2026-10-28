import type {
  EmployeeRef,
  InterviewKind,
  InterviewStatus,
  InterviewView,
  ScorecardView,
} from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge, type Tone } from '../ui';
import { InterviewActions } from './interview-forms';
import { dhakaFormat } from './pipeline-views';

// Interviews as HR and the hiring manager see them, and scorecards wherever they are shown.

const STATUS_TONE: Record<InterviewStatus, Tone> = {
  scheduled: 'blue',
  completed: 'green',
  cancelled: 'slate',
};

export async function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  const t = await getTranslations('interviews.statuses');
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>;
}

/** When and where, in Dhaka time, with the link for a video call. */
export async function InterviewWhen({
  interview,
}: {
  interview: {
    kind: InterviewKind;
    startsAt: string;
    endsAt: string;
    location: string | null;
    meetingUrl: string | null;
  };
}) {
  const t = await getTranslations('interviews');
  const { time, clock } = await dhakaFormat();
  return (
    <div className="space-y-0.5 text-sm text-slate-700">
      <p>
        {time(interview.startsAt)}–{clock(interview.endsAt)} · {t(`kinds.${interview.kind}`)}
      </p>
      {interview.location && <p>{interview.location}</p>}
      {interview.meetingUrl && (
        <a
          href={interview.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 hover:underline"
        >
          {t('join')}
        </a>
      )}
    </div>
  );
}

export async function Scorecard({
  scorecard,
  criteria,
}: {
  scorecard: ScorecardView;
  criteria: string[];
}) {
  const t = await getTranslations('interviews');
  const { time } = await dhakaFormat();
  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {criteria.map((c) => (
          <div key={c} className="contents">
            <dt className="text-slate-600">{c}</dt>
            <dd className="font-medium tabular-nums">
              {scorecard.ratings[c] !== undefined
                ? t('scorecard.outOf', { rating: scorecard.ratings[c] })
                : '–'}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        <span className="text-slate-600">{t('scorecard.recommendation')}: </span>
        <span className="font-medium">{t(`recommendations.${scorecard.recommendation}`)}</span>
      </p>
      {scorecard.feedback && (
        <p className="whitespace-pre-line text-slate-700">{scorecard.feedback}</p>
      )}
      <p className="text-xs text-slate-500">
        {t('scorecard.submittedOn', { date: time(scorecard.submittedAt) })}
      </p>
    </div>
  );
}

/** Whether an interview has begun, as the server renders the page. */
const hasStarted = (startsAt: string) => Date.parse(startsAt) <= Date.now();

const personName = (p: EmployeeRef, locale: string) =>
  locale === 'bn' && p.fullNameBn ? p.fullNameBn : p.fullName;

/** An application's interviews with their panels and every scorecard. */
export async function InterviewList({
  interviews,
  applicationId,
  criteria,
  changeable,
}: {
  interviews: InterviewView[];
  applicationId: string;
  criteria: string[];
  /** The application is open, so scheduled interviews may still change. */
  changeable: boolean;
}) {
  const t = await getTranslations('interviews.panel');
  const locale = await getLocale();
  if (interviews.length === 0) return <p className="text-sm text-slate-500">{t('none')}</p>;
  return (
    <ul className="space-y-4">
      {interviews.map((i) => (
        <li key={i.id} className="space-y-3 rounded-lg p-4 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <InterviewWhen interview={i} />
            <InterviewStatusBadge status={i.status} />
          </div>
          {i.notes && <p className="text-sm whitespace-pre-line text-slate-600">{i.notes}</p>}
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t('interviewers')}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {i.panel.map((p) => (
                <li key={p.employee.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-sm font-medium">
                    {personName(p.employee, locale)}{' '}
                    <span className="font-mono text-xs text-slate-400">
                      {p.employee.employeeCode}
                    </span>
                  </p>
                  {p.scorecard ? (
                    <Scorecard scorecard={p.scorecard} criteria={criteria} />
                  ) : (
                    <p className="text-sm text-slate-500">{t('pending')}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {changeable && i.status === 'scheduled' && (
            <InterviewActions
              interview={i}
              applicationId={applicationId}
              started={hasStarted(i.startsAt)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
