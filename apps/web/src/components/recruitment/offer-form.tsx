'use client';

import {
  EMPLOYMENT_TYPES,
  OFFER_LANGUAGES,
  type OfferDefaults,
  type OfferView,
  type OrgSnapshot,
} from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { createOffer, updateOffer } from '@/app/actions/offers';
import type { ActionState } from '@/app/actions/platform';
import { treeOrder } from '@/lib/org';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

/** Rows in use, and the one the offer already has even if no longer in use. */
const active = <T extends { id: string; isActive: boolean }>(rows: T[], keep?: string | null) =>
  rows.filter((r) => r.isActive || r.id === keep);

/** A stored amount as typed: 13000.00 → 13000. */
const amount = (v: string | null | undefined) => (v ? String(Number(v)) : '');

/**
 * A new offer, prefilled from the opening, or an offer's terms changed. The company comes
 * first: units and places follow it.
 */
export function OfferForm({
  applicationId,
  offer,
  defaults,
  org,
  budgetMax,
  probation,
}: {
  applicationId: string;
  offer?: OfferView;
  defaults: OfferDefaults;
  org: OrgSnapshot;
  budgetMax: string | null;
  probation: { clerical: number; other: number };
}) {
  const t = useTranslations('offers.form');
  const tt = useTranslations('offers.terms');
  const th = useTranslations('hr');
  const format = useFormatter();
  const [state, action] = useActionState<ActionState<OfferView>, FormData>(
    offer ? updateOffer.bind(null, offer.id) : createOffer.bind(null, applicationId),
    undefined,
  );
  const start = {
    legalEntityId: offer?.legalEntity.id ?? defaults.legalEntityId,
    orgUnitId: offer ? (offer.orgUnit?.id ?? null) : defaults.orgUnitId,
    locationId: offer ? (offer.location?.id ?? null) : defaults.locationId,
    designationId: offer ? (offer.designation?.id ?? null) : defaults.designationId,
    gradeId: offer ? (offer.grade?.id ?? null) : defaults.gradeId,
    employmentType: offer?.employmentType ?? defaults.employmentType,
    language: offer?.language ?? defaults.language,
  };
  const [entityId, setEntityId] = useState(start.legalEntityId);
  const [type, setType] = useState<string>(start.employmentType);
  const err = (path: string) => issueFor(state, path);
  const choose = t('choose');
  const units = treeOrder(
    active(org.orgUnits, start.orgUnitId).filter((u) => u.legalEntityId === entityId),
  );

  return (
    <Form state={state} action={action} className="space-y-4">
      {state?.error && !state.issues?.length && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tt('company')} error={err('legalEntityId')}>
          <select
            name="legalEntityId"
            required
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className={inputClass}
          >
            {active(org.legalEntities, start.legalEntityId).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tt('unit')} error={err('orgUnitId')}>
          <select
            key={`unit-${entityId}`}
            name="orgUnitId"
            defaultValue={entityId === start.legalEntityId ? (start.orgUnitId ?? '') : ''}
            className={inputClass}
          >
            <option value="">{choose}</option>
            {units.map(({ unit, depth }) => (
              <option key={unit.id} value={unit.id}>
                {`${'  '.repeat(depth)}${unit.name}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tt('location')} error={err('locationId')}>
          <select
            key={`loc-${entityId}`}
            name="locationId"
            defaultValue={entityId === start.legalEntityId ? (start.locationId ?? '') : ''}
            className={inputClass}
          >
            <option value="">{choose}</option>
            {active(org.locations, start.locationId)
              .filter((l) => l.legalEntityId === entityId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={tt('designation')} error={err('designationId')}>
          <select
            name="designationId"
            defaultValue={start.designationId ?? ''}
            className={inputClass}
          >
            <option value="">{choose}</option>
            {active(org.designations, start.designationId).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tt('grade')} error={err('gradeId')}>
          <select name="gradeId" defaultValue={start.gradeId ?? ''} className={inputClass}>
            <option value="">{choose}</option>
            {active(org.grades, start.gradeId).map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tt('employmentType')} error={err('employmentType')}>
          <select
            name="employmentType"
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={inputClass}
          >
            {EMPLOYMENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {th(`employmentTypes.${v}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tt('joiningOn')} error={err('joiningOn')}>
          <input
            name="joiningOn"
            type="date"
            required
            defaultValue={offer?.joiningOn}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('monthlyGross')}
          hint={
            budgetMax
              ? t('monthlyGrossHint', {
                  amount: format.number(Number(budgetMax), { maximumFractionDigits: 2 }),
                })
              : t('monthlyGrossNoBudget')
          }
          error={err('monthlyGross')}
        >
          <input
            name="monthlyGross"
            inputMode="decimal"
            required
            defaultValue={amount(offer?.monthlyGross)}
            className={inputClass}
          />
        </Field>
        {type === 'probationer' && (
          <Field
            label={t('probationMonths')}
            hint={t('probationHint', probation)}
            error={err('probationMonths')}
          >
            <input
              name="probationMonths"
              type="number"
              min={1}
              max={probation.clerical}
              defaultValue={offer?.probationMonths ?? ''}
              className={inputClass}
            />
          </Field>
        )}
        <Field label={t('expiresOn')} hint={t('expiresHint')} error={err('expiresOn')}>
          <input
            name="expiresOn"
            type="date"
            required
            defaultValue={offer?.expiresOn}
            className={inputClass}
          />
        </Field>
        <Field label={t('language')} error={err('language')}>
          <select name="language" defaultValue={start.language} className={inputClass}>
            {OFFER_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {tt(`languages.${l}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('terms')} hint={t('termsHint')} error={err('terms')}>
        <textarea
          name="terms"
          rows={4}
          maxLength={5000}
          defaultValue={offer?.terms ?? ''}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{offer ? t('saveChanges') : t('save')}</SubmitButton>
    </Form>
  );
}
