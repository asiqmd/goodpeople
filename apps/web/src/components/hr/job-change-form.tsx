'use client';

import {
  EMPLOYMENT_TYPES,
  JOB_CHANGE_EVENTS,
  WORKER_CATEGORIES,
  type JobAssignmentView,
  type OrgSnapshot,
  type Ref,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { changeJob } from '@/app/actions/hr';
import type { ActionState } from '@/app/actions/platform';
import { treeOrder } from '@/lib/org';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

const CLEAR = '__clear';
const active = <T extends { isActive: boolean }>(rows: T[]) => rows.filter((r) => r.isActive);

/**
 * Records a dated job change. Every field defaults to "no change", so HR only touches what
 * actually changes; the API carries the rest over from the current assignment.
 */
export function JobChangeForm({
  employeeId,
  current,
  org,
  managers,
}: {
  employeeId: string;
  current: JobAssignmentView | null;
  org: OrgSnapshot;
  managers: Ref[];
}) {
  const t = useTranslations('hr.detail');
  const tf = useTranslations('hr.form');
  const th = useTranslations('hr');
  const [state, action] = useActionState<ActionState, FormData>(
    changeJob.bind(null, employeeId),
    undefined,
  );
  const form = useRef<HTMLFormElement>(null);
  const [entityId, setEntityId] = useState(current?.legalEntity.id ?? '');
  const err = (path: string) => issueFor(state, path);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  const noChange = <option value="">{t('noChange')}</option>;
  const remove = <option value={CLEAR}>{t('remove')}</option>;

  return (
    <Form ref={form} state={state} action={action} className="space-y-4">
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('changeRecorded')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('event')} error={err('event')}>
          <select name="event" required defaultValue="" className={inputClass}>
            <option value="">{tf('choose')}</option>
            {JOB_CHANGE_EVENTS.map((e) => (
              <option key={e} value={e}>
                {th(`jobEvents.${e}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('effectiveFrom')} error={err('effectiveFrom')}>
          <input name="effectiveFrom" type="date" required className={inputClass} />
        </Field>
        <Field label={t('reason')} error={err('reason')}>
          <input name="reason" required minLength={3} className={inputClass} />
        </Field>
      </div>
      {err('changes') && <p className="text-xs text-red-600">{err('changes')}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tf('legalEntity')}>
          <select
            name="changes.legalEntityId"
            defaultValue=""
            onChange={(e) => setEntityId(e.target.value || current?.legalEntity.id || '')}
            className={inputClass}
          >
            {noChange}
            {active(org.legalEntities).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tf('location')}>
          <select
            key={`loc-${entityId}`}
            name="changes.locationId"
            defaultValue=""
            className={inputClass}
          >
            {noChange}
            {remove}
            {active(org.locations)
              .filter((l) => l.legalEntityId === entityId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={tf('orgUnit')}>
          <select
            key={`unit-${entityId}`}
            name="changes.orgUnitId"
            defaultValue=""
            className={inputClass}
          >
            {noChange}
            {remove}
            {treeOrder(active(org.orgUnits).filter((u) => u.legalEntityId === entityId)).map(
              ({ unit, depth }) => (
                <option key={unit.id} value={unit.id}>
                  {`${'  '.repeat(depth)}${unit.name}`}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={tf('designation')}>
          <select name="changes.designationId" defaultValue="" className={inputClass}>
            {noChange}
            {active(org.designations).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tf('grade')}>
          <select name="changes.gradeId" defaultValue="" className={inputClass}>
            {noChange}
            {active(org.grades).map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tf('costCentre')}>
          <select name="changes.costCentreId" defaultValue="" className={inputClass}>
            {noChange}
            {active(org.costCentres).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tf('manager')}>
          <select name="changes.managerId" defaultValue="" className={inputClass}>
            {noChange}
            {remove}
            {managers
              .filter((m) => m.id !== employeeId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={tf('employmentType')}>
          <select name="changes.employmentType" defaultValue="" className={inputClass}>
            {noChange}
            {EMPLOYMENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {th(`employmentTypes.${v}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tf('workerCategory')}>
          <select name="changes.workerCategory" defaultValue="" className={inputClass}>
            {noChange}
            {WORKER_CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {th(`workerCategories.${v}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SubmitButton>{t('recordChange')}</SubmitButton>
    </Form>
  );
}
