'use client';

import {
  BLOOD_GROUPS,
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  RELIGIONS,
  TENANT_ROLES,
  WORKER_CATEGORIES,
  type EmployeeDetail,
  type HireResult,
  type OrgSnapshot,
  type Ref,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { hireEmployee, updateEmployee } from '@/app/actions/hr';
import type { ActionState } from '@/app/actions/platform';
import { treeOrder } from '@/lib/org';
import { issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Card, Field, inputClass } from '../ui';
import { AddressFields } from './address-fields';

type State = ActionState<HireResult>;

const active = <T extends { isActive: boolean }>(rows: T[]) => rows.filter((r) => r.isActive);

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card title={title}>
      {hint && <p className="-mt-2 mb-4 text-xs text-slate-500">{hint}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function EnumSelect({
  name,
  values,
  labels,
  defaultValue,
  required,
  placeholder,
}: {
  name: string;
  values: readonly string[];
  labels: (v: string) => string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder: string;
}) {
  return (
    <select
      name={name}
      required={required}
      defaultValue={defaultValue ?? ''}
      className={inputClass}
    >
      <option value="">{placeholder}</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {labels(v)}
        </option>
      ))}
    </select>
  );
}

/**
 * Hire a new employee (mode "hire") or edit an existing one's personal details (mode "edit").
 * Job changes after hire go through the job tab, never this form.
 */
export function EmployeeForm(
  props:
    | { mode: 'hire'; org: OrgSnapshot; managers: Ref[] }
    | { mode: 'edit'; employee: EmployeeDetail },
) {
  const t = useTranslations('hr.form');
  const th = useTranslations('hr');
  const employee = props.mode === 'edit' ? props.employee : undefined;
  // Both actions accept and return the same state shape; only hire ever sets `result`.
  const action = (
    props.mode === 'hire' ? hireEmployee : updateEmployee.bind(null, props.employee.id)
  ) as (state: State, form: FormData) => Promise<State>;
  const [state, formAction] = useActionState<State, FormData>(action, undefined);
  const [sameAddress, setSameAddress] = useState(props.mode === 'hire');
  const [portal, setPortal] = useState(false);
  const err = (path: string) => issueFor(state, path);
  const choose = t('choose');

  if (state?.result) {
    const { employee: hired, temporaryPassword } = state.result;
    return (
      <Card>
        <div className="space-y-4">
          <Banner tone="green">{t('hired', { name: hired.fullName })}</Banner>
          {temporaryPassword && hired.portalUser && (
            <div className="rounded-lg bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
              <p>{t('tempPassword', { email: hired.portalUser.email })}</p>
              <code className="mt-2 block select-all rounded bg-white px-3 py-2 font-mono text-base ring-1 ring-slate-200">
                {temporaryPassword}
              </code>
            </div>
          )}
          <div className="flex gap-3">
            <Link href={`/workspace/employees/${hired.id}`} className={buttonClass.primary}>
              {t('viewEmployee')}
            </Link>
            {/* A reload starts a fresh, empty form. */}
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => window.location.reload()}
            >
              {t('hireAnother')}
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}

      <Section title={t('personal')}>
        <Field label={t('fullName')} error={err('fullName')}>
          <input
            name="fullName"
            required
            defaultValue={employee?.fullName}
            className={inputClass}
          />
        </Field>
        <Field label={t('fullNameBn')} error={err('fullNameBn')}>
          <input
            name="fullNameBn"
            lang="bn"
            defaultValue={employee?.fullNameBn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('fatherName')} error={err('fatherName')}>
          <input
            name="fatherName"
            required
            defaultValue={employee?.fatherName}
            className={inputClass}
          />
        </Field>
        <Field label={t('motherName')} error={err('motherName')}>
          <input
            name="motherName"
            required
            defaultValue={employee?.motherName}
            className={inputClass}
          />
        </Field>
        <Field label={t('spouseName')} error={err('spouseName')}>
          <input
            name="spouseName"
            defaultValue={employee?.spouseName ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('dateOfBirth')} error={err('dateOfBirth')}>
          <input
            name="dateOfBirth"
            type="date"
            required
            defaultValue={employee?.dateOfBirth}
            className={inputClass}
          />
        </Field>
        <Field label={t('gender')} error={err('gender')}>
          <EnumSelect
            name="gender"
            required
            values={GENDERS}
            labels={(v) => th(`genders.${v}`)}
            defaultValue={employee?.gender}
            placeholder={choose}
          />
        </Field>
        <Field label={t('religion')} hint={t('religionHint')} error={err('religion')}>
          <EnumSelect
            name="religion"
            values={RELIGIONS}
            labels={(v) => th(`religions.${v}`)}
            defaultValue={employee?.religion}
            placeholder={choose}
          />
        </Field>
        <Field label={t('maritalStatus')} error={err('maritalStatus')}>
          <EnumSelect
            name="maritalStatus"
            values={MARITAL_STATUSES}
            labels={(v) => th(`maritalStatuses.${v}`)}
            defaultValue={employee?.maritalStatus}
            placeholder={choose}
          />
        </Field>
        <Field label={t('bloodGroup')} error={err('bloodGroup')}>
          <EnumSelect
            name="bloodGroup"
            values={BLOOD_GROUPS}
            labels={(v) => v}
            defaultValue={employee?.bloodGroup}
            placeholder={choose}
          />
        </Field>
      </Section>

      <Section title={t('contact')}>
        <Field label={t('mobilePhone')} error={err('mobilePhone')}>
          <input
            name="mobilePhone"
            type="tel"
            required
            placeholder="01712345678"
            defaultValue={employee?.mobilePhone}
            className={inputClass}
          />
        </Field>
        <Field label={t('workEmail')} error={err('workEmail')}>
          <input
            name="workEmail"
            type="email"
            defaultValue={employee?.workEmail ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('personalEmail')} error={err('personalEmail')}>
          <input
            name="personalEmail"
            type="email"
            defaultValue={employee?.personalEmail ?? ''}
            className={inputClass}
          />
        </Field>
        <div className="hidden sm:block" />
        <Field
          label={`${t('emergencyContact')}: ${t('emergencyName')}`}
          error={err('emergencyContact.name')}
        >
          <input
            name="emergencyContact.name"
            defaultValue={employee?.emergencyContact?.name}
            className={inputClass}
          />
        </Field>
        <Field label={t('emergencyRelation')} error={err('emergencyContact.relation')}>
          <input
            name="emergencyContact.relation"
            defaultValue={employee?.emergencyContact?.relation}
            className={inputClass}
          />
        </Field>
        <Field label={t('emergencyPhone')} error={err('emergencyContact.phone')}>
          <input
            name="emergencyContact.phone"
            type="tel"
            defaultValue={employee?.emergencyContact?.phone}
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title={t('identity')} hint={t('identityHint')}>
        {(['nid', 'birthRegistration', 'passport', 'tin'] as const).map((key) => (
          <Field key={key} label={t(key)} error={err(`identity.${key}`)}>
            <input
              name={`identity.${key}`}
              inputMode={key === 'passport' ? 'text' : 'numeric'}
              autoComplete="off"
              defaultValue={employee?.identity[key] ?? ''}
              className={inputClass}
            />
          </Field>
        ))}
      </Section>

      <Card title={t('presentAddress')}>
        <AddressFields prefix="presentAddress" defaults={employee?.presentAddress} state={state} />
      </Card>
      <Card title={t('permanentAddress')}>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="sameAsPresent"
            checked={sameAddress}
            onChange={(e) => setSameAddress(e.target.checked)}
          />
          {t('sameAsPresent')}
        </label>
        {!sameAddress && (
          <AddressFields
            prefix="permanentAddress"
            defaults={employee?.permanentAddress}
            state={state}
          />
        )}
      </Card>

      {props.mode === 'hire' && (
        <JobFields org={props.org} managers={props.managers} state={state} />
      )}

      {props.mode === 'edit' && (
        <Section title={t('job')}>
          <Field label={t('probationEndsOn')} error={err('probationEndsOn')}>
            <input
              name="probationEndsOn"
              type="date"
              defaultValue={employee?.probationEndsOn ?? ''}
              className={inputClass}
            />
          </Field>
        </Section>
      )}

      {props.mode === 'hire' && (
        <Card title={t('portal')}>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="portalEnabled"
              checked={portal}
              onChange={(e) => setPortal(e.target.checked)}
            />
            {t('portalEnable')}
          </label>
          {portal && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('portalEmail')} error={err('portalAccess.email')}>
                <input name="portalAccess.email" type="email" required className={inputClass} />
              </Field>
              <Field label={t('portalRole')}>
                <EnumSelect
                  name="portalAccess.role"
                  values={TENANT_ROLES}
                  labels={(v) => th(`roles.${v}`)}
                  defaultValue="employee"
                  placeholder={choose}
                />
              </Field>
            </div>
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <SubmitButton>{props.mode === 'hire' ? t('hire') : t('save')}</SubmitButton>
      </div>
    </form>
  );
}

/** Company first: locations and units follow the chosen company. */
function JobFields({ org, managers, state }: { org: OrgSnapshot; managers: Ref[]; state: State }) {
  const t = useTranslations('hr.form');
  const th = useTranslations('hr');
  const entities = active(org.legalEntities);
  const [entityId, setEntityId] = useState(entities.length === 1 ? entities[0]!.id : '');
  const units = treeOrder(active(org.orgUnits).filter((u) => u.legalEntityId === entityId));
  const err = (path: string) => issueFor(state, path);
  const choose = t('choose');

  return (
    <Section title={t('job')}>
      <Field label={t('employeeCode')} error={err('employeeCode')}>
        <input name="employeeCode" required className={inputClass} />
      </Field>
      <Field label={t('joinedOn')} error={err('joinedOn')}>
        <input name="joinedOn" type="date" required className={inputClass} />
      </Field>
      <Field label={t('legalEntity')} error={err('job.legalEntityId')}>
        <select
          name="job.legalEntityId"
          required
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className={inputClass}
        >
          <option value="">{choose}</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('location')} error={err('job.locationId')}>
        <select key={`loc-${entityId}`} name="job.locationId" className={inputClass}>
          <option value="">{choose}</option>
          {active(org.locations)
            .filter((l) => l.legalEntityId === entityId)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label={t('orgUnit')} error={err('job.orgUnitId')}>
        <select key={`unit-${entityId}`} name="job.orgUnitId" className={inputClass}>
          <option value="">{choose}</option>
          {units.map(({ unit, depth }) => (
            <option key={unit.id} value={unit.id}>
              {`${'  '.repeat(depth)}${unit.name}`}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('designation')} error={err('job.designationId')}>
        <select name="job.designationId" className={inputClass}>
          <option value="">{choose}</option>
          {active(org.designations).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('grade')} error={err('job.gradeId')}>
        <select name="job.gradeId" className={inputClass}>
          <option value="">{choose}</option>
          {active(org.grades).map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} · {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('costCentre')} error={err('job.costCentreId')}>
        <select name="job.costCentreId" className={inputClass}>
          <option value="">{choose}</option>
          {active(org.costCentres).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('manager')} error={err('job.managerId')}>
        <select name="job.managerId" className={inputClass}>
          <option value="">{choose}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('employmentType')} error={err('job.employmentType')}>
        <EnumSelect
          name="job.employmentType"
          required
          values={EMPLOYMENT_TYPES}
          labels={(v) => th(`employmentTypes.${v}`)}
          defaultValue="probationer"
          placeholder={choose}
        />
      </Field>
      <Field label={t('workerCategory')} error={err('job.workerCategory')}>
        <EnumSelect
          name="job.workerCategory"
          required
          values={WORKER_CATEGORIES}
          labels={(v) => th(`workerCategories.${v}`)}
          defaultValue="worker"
          placeholder={choose}
        />
      </Field>
      <Field label={t('probationEndsOn')} error={err('probationEndsOn')}>
        <input name="probationEndsOn" type="date" className={inputClass} />
      </Field>
    </Section>
  );
}
