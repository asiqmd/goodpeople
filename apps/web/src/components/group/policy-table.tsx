'use client';

import { POLICY_FIELDS, SELF_PUNCH_MODES, type PolicyArea, type PolicyView } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { followGroupPolicy, savePolicy } from '@/app/actions/group';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Badge, Banner, buttonClass, Field, inputClass } from '../ui';

type Values = Record<string, unknown>;
type CompanyPolicy = PolicyView['companies'][number];

const IN_HOURS = new Set([
  'overtimeDailyCapMinutes',
  'overtimeWeeklyCapMinutes',
  'overtimeMonthlyCapMinutes',
]);
/** Fields whose null means "no limit" rather than "follow the group". */
const NO_LIMIT: Record<string, string> = {
  maxDaysPerRequest: 'noLimit',
  overtimeMonthlyCapMinutes: 'noCap',
};

/** A policy value as people read it: days, hours, a percentage, a punching rule. */
function useShow() {
  const t = useTranslations('group.policies');
  return (field: string, value: unknown) => {
    if (value === null || value === undefined) {
      return NO_LIMIT[field] ? t(`values.${NO_LIMIT[field]}`) : '—';
    }
    if (field === 'selfPunch') return t(`selfPunch.${value as string}`);
    if (field === 'requireSelfie') return t(value ? 'values.yes' : 'values.no');
    if (field === 'pfEmployeeRate' || field === 'pfEmployerRate') {
      return t('values.percent', { value: Number(value) });
    }
    if (IN_HOURS.has(field)) return t('values.hours', { value: Number(value) / 60 });
    return t('values.days', { count: Number(value) });
  };
}

/** What the form shows for a value: hours for caps, the number for the rest. */
const formValue = (field: string, value: unknown) =>
  value === null || value === undefined
    ? ''
    : IN_HOURS.has(field)
      ? String(Number(value) / 60)
      : String(value);

function FieldInput({
  field,
  group,
  value,
  error,
}: {
  field: string;
  group: unknown;
  value: unknown;
  error?: string;
}) {
  const t = useTranslations('group.policies');
  const show = useShow();
  if (field === 'selfPunch' || field === 'requireSelfie') {
    const options =
      field === 'selfPunch'
        ? SELF_PUNCH_MODES.map((m) => [m, t(`selfPunch.${m}`)] as const)
        : ([
            ['true', t('values.yes')],
            ['false', t('values.no')],
          ] as const);
    return (
      <Field label={t(`fields.${field}`)} error={error}>
        <select name={field} defaultValue={formValue(field, value)} className={inputClass}>
          <option value="">{t('followGroup', { value: show(field, group) })}</option>
          {options.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  const rate = field === 'pfEmployeeRate' || field === 'pfEmployerRate';
  const hint = t(IN_HOURS.has(field) ? 'groupValueHours' : 'groupValue', {
    value: show(field, group),
  });
  return (
    <Field label={t(`fields.${field}`)} hint={hint} error={error}>
      <input
        name={field}
        type="number"
        min={rate ? 0 : field === 'maxDaysPerRequest' ? 1 : 0}
        max={rate ? 30 : undefined}
        step={rate ? 0.01 : field === 'maxDaysPerRequest' ? 1 : 0.5}
        defaultValue={formValue(field, value)}
        placeholder={formValue(field, group)}
        className={`${inputClass} max-w-40`}
      />
      {NO_LIMIT[field] && (
        <span className="mt-1 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name={`${field}.none`} defaultChecked={value === null} />
          {t(`values.${NO_LIMIT[field]}`)}
        </span>
      )}
    </Field>
  );
}

/** What one company overrides, value by value; anything left empty follows the group. */
function OverrideForm({
  area,
  subjectId,
  company,
  group,
  onClose,
}: {
  area: PolicyArea;
  subjectId: string | null;
  company: CompanyPolicy;
  group: Values;
  onClose: () => void;
}) {
  const t = useTranslations('group.policies');
  const [state, action] = useActionState(
    savePolicy.bind(null, company.legalEntity.id, area, subjectId),
    undefined,
  );
  const override = (company.override ?? {}) as Values;
  return (
    <Form state={state} action={action} className="space-y-3">
      {state?.error && (
        <Banner tone="red">
          {issueFor(state, 'values') ? t('chooseOne') : <ErrorText state={state} />}
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <p className="text-xs text-slate-500">
        {t('formHint', { company: company.legalEntity.name })}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {POLICY_FIELDS[area].map((field) => (
          <FieldInput
            key={field}
            field={field}
            group={group[field]}
            value={override[field]}
            error={issueFor(state, field)}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <SubmitButton>{t('save')}</SubmitButton>
        <button type="button" onClick={onClose} className={buttonClass.secondary}>
          {t('close')}
        </button>
      </div>
    </Form>
  );
}

function FollowGroupButton({
  area,
  subjectId,
  legalEntityId,
}: {
  area: PolicyArea;
  subjectId: string | null;
  legalEntityId: string;
}) {
  const t = useTranslations('group.policies');
  const [state, action] = useActionState(
    followGroupPolicy.bind(null, legalEntityId, area, subjectId),
    undefined,
  );
  return (
    <form action={action} className="inline">
      <button type="submit" className={buttonClass.ghost}>
        {t('useGroup')}
      </button>
      {state?.error && (
        <span className="block text-xs text-red-600">
          <ErrorText state={state} />
        </span>
      )}
    </form>
  );
}

function CompanyRows({
  policy,
  company,
  span,
}: {
  policy: PolicyView;
  company: CompanyPolicy;
  span: number;
}) {
  const t = useTranslations('group.policies');
  const show = useShow();
  const [editing, setEditing] = useState(false);
  const group = policy.group as Values;
  const effective = company.effective as Values;
  const override = (company.override ?? {}) as Values;
  const differs = new Set<string>(company.differs);
  const subjectId = policy.leaveType?.id ?? null;
  return (
    <>
      <tr className="align-top">
        <th scope="row" className="px-5 py-2 text-left font-medium">
          {company.legalEntity.name}
          <span className="mt-1 block">
            {company.override ? (
              <Badge tone="blue">{t('ownPolicy')}</Badge>
            ) : (
              <Badge tone="slate">{t('followsGroup')}</Badge>
            )}
          </span>
        </th>
        {POLICY_FIELDS[policy.area].map((field) => (
          <td
            key={field}
            className={`px-3 py-2 ${field in override ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
          >
            {show(field, effective[field])}
            {differs.has(field) && (
              <span className="block text-xs font-normal text-slate-500">
                {t('groupValue', { value: show(field, group[field]) })}
              </span>
            )}
          </td>
        ))}
        <td className="whitespace-nowrap px-5 py-2 text-right">
          <span className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              aria-expanded={editing}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              {t('change')}
            </button>
            {company.override && (
              <FollowGroupButton
                area={policy.area}
                subjectId={subjectId}
                legalEntityId={company.legalEntity.id}
              />
            )}
          </span>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={span} className="bg-slate-50 px-5 py-4">
            <OverrideForm
              area={policy.area}
              subjectId={subjectId}
              company={company}
              group={group}
              onClose={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** One policy: the group's values, then each company's, with what it overrides. */
export function PolicyTable({ policy }: { policy: PolicyView }) {
  const t = useTranslations('group.policies');
  const show = useShow();
  const fields = POLICY_FIELDS[policy.area];
  const group = policy.group as Values;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-2 font-medium">
              {t('company')}
            </th>
            {fields.map((field) => (
              <th key={field} scope="col" className="px-3 py-2 font-medium">
                {t(`fields.${field}`)}
              </th>
            ))}
            <th scope="col" className="px-5 py-2">
              <span className="sr-only">{t('actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-slate-50">
            <th scope="row" className="px-5 py-2 text-left font-semibold">
              {t('group')}
            </th>
            {fields.map((field) => (
              <td key={field} className="px-3 py-2 font-medium">
                {show(field, group[field])}
              </td>
            ))}
            <td />
          </tr>
          {policy.companies.map((company) => (
            <CompanyRows
              key={company.legalEntity.id}
              policy={policy}
              company={company}
              span={fields.length + 2}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
