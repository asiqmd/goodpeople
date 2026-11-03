'use server';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
export type InternationalState = { ok?: boolean; error?: string } | undefined;
export async function internationalChange(
  _: InternationalState,
  f: FormData,
): Promise<InternationalState> {
  const op = String(f.get('op'));
  let body: Record<string, unknown>;
  let path: string;
  if (op === 'company') {
    path = 'companies';
    body = {
      name: String(f.get('name')),
      code: String(f.get('code')),
      countryCode: String(f.get('countryCode')),
    };
  } else {
    path = 'profiles';
    body = Object.fromEntries(
      [
        'legalEntityId',
        'countryCode',
        'regime',
        'currency',
        'effectiveFrom',
        'businessTimeZone',
        'calendar',
        'reason',
      ].map((k) => [k, String(f.get(k))]),
    );
  }
  const result = await authedFetch('tenant', '/tenant/international/' + path, {
    method: 'POST',
    body,
  });
  if (!result.ok) return { error: result.error.message };
  revalidatePath('/workspace/international');
  return { ok: true };
}

export async function commercialPriceChange(
  _: InternationalState,
  form: FormData,
): Promise<InternationalState> {
  const body = Object.fromEntries(
    [
      'planCode',
      'currency',
      'seatPrice',
      'effectiveFrom',
      'merchantProduct',
      'merchantPrice',
      'reason',
    ].map((key) => [key, String(form.get(key))]),
  );
  const result = await authedFetch('platform', '/platform/international/prices', {
    method: 'POST',
    body,
  });
  if (!result.ok) return { error: result.error.message };
  revalidatePath('/platform/international');
  return { ok: true };
}
