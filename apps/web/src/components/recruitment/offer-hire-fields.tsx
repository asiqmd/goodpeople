'use client';

import {
  WORKER_CATEGORIES,
  type OfferHirePrefill,
  type OfferHireResult,
  type OrgSnapshot,
  type Ref,
} from '@gp/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { issueFor } from '../forms';
import { Banner, Card, Field, inputClass } from '../ui';

type State = { issues?: { path: string; message: string }[] } | undefined;

/**
 * The hire form's job and pay for an accepted offer: the job and joining date come from the
 * offer and are shown, not asked; HR adds the code, category, manager and cost centre, and
 * where in payroll the offered gross is proposed.
 */
export function OfferHireFields({
  prefill,
  org,
  managers,
  state,
}: {
  prefill: OfferHirePrefill;
  org: OrgSnapshot;
  managers: Ref[];
  state: State;
}) {
  const t = useTranslations('offers.hire');
  const tf = useTranslations('hr.form');
  const th = useTranslations('hr');
  const tt = useTranslations('offers.terms');
  const format = useFormatter();
  const locale = useLocale();
  const { offer, payroll } = prefill;
  const structures = payroll?.structures.filter((s) => s.basis === 'gross') ?? [];
  const [structureId, setStructureId] = useState(structures.length === 1 ? structures[0]!.id : '');
  const chosen = structures.find((s) => s.id === structureId);
  const err = (path: string) => issueFor(state, path);
  const choose = tf('choose');
  const named = (ref: { name: string; nameBn: string | null } | null) =>
    ref ? (locale === 'bn' && ref.nameBn ? ref.nameBn : ref.name) : '—';
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const gross = format.number(Number(offer.monthlyGross), { maximumFractionDigits: 2 });
  const job: [string, string][] = [
    [tt('company'), offer.legalEntity.name],
    [tt('unit'), named(offer.orgUnit)],
    [tt('location'), named(offer.location)],
    [tt('designation'), named(offer.designation)],
    [tt('grade'), named(offer.grade)],
    [tt('employmentType'), th(`employmentTypes.${offer.employmentType}`)],
    [tf('joinedOn'), day(offer.joiningOn)],
    [tf('probationEndsOn'), prefill.probationEndsOn ? day(prefill.probationEndsOn) : '—'],
  ];

  return (
    <>
      <Card title={tf('job')}>
        <p className="-mt-2 mb-4 text-xs text-slate-500">{t('jobHint')}</p>
        <dl className="mb-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {job.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-slate-100 pb-1">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tf('employeeCode')} error={err('employeeCode')}>
            <input name="employeeCode" required className={inputClass} />
          </Field>
          <Field label={tf('workerCategory')} error={err('job.workerCategory')}>
            <select
              name="job.workerCategory"
              required
              defaultValue={prefill.workerCategory}
              className={inputClass}
            >
              {WORKER_CATEGORIES.map((v) => (
                <option key={v} value={v}>
                  {th(`workerCategories.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tf('manager')} error={err('job.managerId')}>
            <select name="job.managerId" className={inputClass}>
              <option value="">{choose}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tf('costCentre')} error={err('job.costCentreId')}>
            <select name="job.costCentreId" className={inputClass}>
              <option value="">{choose}</option>
              {org.costCentres
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </Card>

      {payroll && (
        <Card title={t('pay')}>
          <p className="-mt-2 mb-4 text-xs text-slate-500">{t('payHint', { amount: gross })}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('structure')} hint={t('structureHint')} error={err('pay.structureId')}>
              <select
                name="pay.structureId"
                value={structureId}
                onChange={(e) => setStructureId(e.target.value)}
                className={inputClass}
              >
                <option value="">{t('noPay')}</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {locale === 'bn' && s.nameBn ? s.nameBn : s.name}
                  </option>
                ))}
              </select>
            </Field>
            {chosen && (
              <Field label={t('payGroup')} error={err('pay.payGroupId')}>
                <select name="pay.payGroupId" required className={inputClass}>
                  <option value="">{choose}</option>
                  {payroll.payGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {chosen?.wageBoard && (
              <Field label={t('wageGrade')} hint={t('wageGradeHint')} error={err('pay.wageGrade')}>
                <input name="pay.wageGrade" required placeholder="G5" className={inputClass} />
              </Field>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

/** After hiring from an offer: whether the offered pay now waits in payroll, or why not. */
export function OfferHireOutcome({ result }: { result: OfferHireResult }) {
  const t = useTranslations('offers.hire');
  const te = useTranslations('errors');
  const format = useFormatter();
  if (result.pay) {
    return (
      <Banner tone={result.pay.status === 'approved' ? 'green' : 'blue'}>
        {t(result.pay.status === 'approved' ? 'payApproved' : 'payProposed', {
          date: format.dateTime(new Date(`${result.pay.effectiveFrom}T00:00:00Z`), {
            dateStyle: 'medium',
            timeZone: 'UTC',
          }),
        })}
      </Banner>
    );
  }
  if (!result.payNote) return null;
  const { code, message } = result.payNote;
  const reason = t.has(`payNotes.${code}`)
    ? t(`payNotes.${code}`)
    : te.has(code)
      ? te(code)
      : message;
  return <Banner tone="amber">{t('payNote', { reason })}</Banner>;
}
