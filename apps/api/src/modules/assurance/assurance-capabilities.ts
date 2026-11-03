import { countryManifest } from '@gp/country-packs';
import { COUNTRY_DEFAULTS, INTERNATIONAL_CHECKOUT_ENABLED } from '@gp/shared';
/** Observe the actual consumer dispatcher, not a staff attestation or a display-language choice. */
export function assuranceCapabilities() {
  const countryConsumers = { BD: false, AE: false, SA: false };
  for (const countryCode of ['BD', 'AE', 'SA'] as const) {
    try {
      countryManifest({
        countryCode,
        ...COUNTRY_DEFAULTS[countryCode],
        calendar: 'gregorian',
        date: new Date().toISOString().slice(0, 10),
      });
      countryConsumers[countryCode] = true;
    } catch {
      /* Unreviewed/unsupported country dispatch stays unavailable. */
    }
  }
  return { countryConsumers, merchantCheckoutQualified: INTERNATIONAL_CHECKOUT_ENABLED };
}
