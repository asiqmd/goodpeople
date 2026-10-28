import {
  CANDIDATE_SOURCES,
  type ApplicationEventView,
  type ApplicationStage,
  type CandidateSource,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { clockOptions } from '@/lib/clock';
import { Badge, type Tone } from '../ui';

// Small server-side pieces of the pipeline pages: stages, times in Dhaka and the history.

export const DHAKA = 'Asia/Dhaka';

export const STAGE_TONE: Record<ApplicationStage, Tone> = {
  applied: 'slate',
  screening: 'blue',
  interview: 'violet',
  offer: 'amber',
  hired: 'green',
  rejected: 'red',
  withdrawn: 'slate',
};

export async function StageBadge({ stage }: { stage: ApplicationStage }) {
  const t = await getTranslations('pipeline.stages');
  return <Badge tone={STAGE_TONE[stage]}>{t(stage)}</Badge>;
}

/** Formats moments in Dhaka time, on a 24-hour clock in Bangla. */
export async function dhakaFormat() {
  const [format, clock] = await Promise.all([getFormatter(), clockOptions()]);
  return {
    time: (iso: string) =>
      format.dateTime(new Date(iso), {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: DHAKA,
        ...clock,
      }),
    day: (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: DHAKA }),
    clock: (iso: string) =>
      format.dateTime(new Date(iso), { timeStyle: 'short', timeZone: DHAKA, ...clock }),
  };
}

const isSource = (note: string | null): note is CandidateSource =>
  (CANDIDATE_SOURCES as readonly string[]).includes(note ?? '');

/** What happened to an application, oldest first, with who did it. */
export async function EventsTimeline({ events }: { events: ApplicationEventView[] }) {
  const t = await getTranslations('pipeline.events');
  const stages = await getTranslations('pipeline.stages');
  const sources = await getTranslations('pipeline.sources');
  const { time } = await dhakaFormat();
  const describe = (e: ApplicationEventView) => {
    if (e.kind === 'stage' && e.toStage === 'applied' && !e.fromStage) {
      return isSource(e.note) ? t('applied', { source: sources(e.note) }) : t('appliedPlain');
    }
    if (e.kind === 'stage' && e.toStage) {
      return e.fromStage
        ? t('moved', { from: stages(e.fromStage), to: stages(e.toStage) })
        : t('movedTo', { to: stages(e.toStage) });
    }
    // Interview, email and offer events carry a code (an offer's, its new status).
    if (e.kind !== 'stage' && e.kind !== 'note' && e.note) {
      const key = `${e.kind}.${e.note}`;
      return t.has(key) ? t(key) : e.note;
    }
    return t(e.kind === 'note' ? 'note' : 'other');
  };
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-slate-300" />
          <p className="font-medium text-slate-800">{describe(e)}</p>
          {e.kind === 'stage' && e.note && !isSource(e.note) && (
            <p className="text-slate-600">{t('reason', { reason: e.note })}</p>
          )}
          {e.kind === 'note' && (
            <p className="whitespace-pre-line text-slate-700">{e.note ?? t('erasedNote')}</p>
          )}
          <p className="text-xs text-slate-500">
            {time(e.createdAt)} · {e.actor ? t('by', { name: e.actor.name }) : t('noActor')}
          </p>
        </li>
      ))}
    </ol>
  );
}
