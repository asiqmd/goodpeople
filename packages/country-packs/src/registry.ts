import { SAUDI_PACK_VERSION } from './sa/manifest.js';
import { UAE_PACK_VERSION } from './ae/manifest.js';
import { createHash } from 'node:crypto';
import { BD_RULES } from './bd/rules.js';
import { allRules } from './engine.js';
export const PACK_VERSION = '5.4.0';
export function countryManifest(context: {
  countryCode: string;
  regime: string;
  currency: string;
  calendar: string;
  date: string;
  through?: string;
}) {
  if (context.countryCode !== 'BD' || context.regime !== 'BD_PRIVATE' || context.currency !== 'BDT')
    throw new Error('country_pack_unreviewed');
  if (context.calendar !== 'gregorian') throw new Error('reviewed_hijri_calendar_required');
  const rules = allRules(BD_RULES).filter(
    (rule) =>
      rule.from <= (context.through ?? context.date) && (!rule.to || rule.to >= context.date),
  );
  if (!rules.length) throw new Error('country_pack_date_unsupported');
  return {
    implementationVersion: PACK_VERSION,
    country: context.countryCode,
    regime: context.regime,
    currency: context.currency,
    calendar: context.calendar,
    date: context.date,
    through: context.through ?? context.date,
    rules: rules.map((r) => ({
      key: r.key,
      from: r.from,
      to: r.to,
      reference: r.reference,
      status: r.status,
      reviewer: null,
      reviewedAt: null,
      sourceVersionHash: createHash('sha256').update(JSON.stringify(r)).digest('hex'),
    })),
    manifestHash: createHash('sha256').update(JSON.stringify(rules)).digest('hex'),
    reviewNote: 'Existing BD source review statuses retained; no new human approval is asserted',
  };
}
export const PACK_REGISTER = [
  { country: 'BD', regime: 'BD_PRIVATE', status: 'existing_bd', version: PACK_VERSION },
  {
    country: 'AE',
    regime: 'AE_FEDERAL_PRIVATE',
    status: 'needs_review',
    version: null,
    candidateVersion: UAE_PACK_VERSION,
  },
  {
    country: 'SA',
    regime: 'SA_PRIVATE',
    status: 'needs_review',
    version: null,
    candidateVersion: SAUDI_PACK_VERSION,
  },
];
