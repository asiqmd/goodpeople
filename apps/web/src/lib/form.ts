const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * FormData → nested object: "presentAddress.district" becomes { presentAddress: { district } }
 * and "rows.0.name" becomes { rows: { 0: { name } } }. Empty fields are dropped, so the API
 * sees them as "not given".
 */
export function nest(form: FormData): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, raw] of form.entries()) {
    // Next.js adds its own $ACTION_* fields to server-action forms.
    if (typeof raw !== 'string' || key.startsWith('$')) continue;
    const value = raw.trim();
    if (value === '') continue;
    const path = key.split('.');
    // A posted "__proto__.x" would otherwise write to every object in the server.
    if (path.some((part) => UNSAFE_KEYS.has(part))) continue;
    let at = out;
    for (const part of path.slice(0, -1)) at = at[part] ??= {};
    at[path.at(-1)!] = value;
  }
  return out;
}

/** { 0: {...}, 1: {...} } from nest() → an array in index order. */
export function rows(value: Record<string, any> | undefined): Record<string, any>[] {
  return Object.keys(value ?? {})
    .toSorted((a, b) => Number(a) - Number(b))
    .map((k) => value![k]);
}

export const toNumber = (value: unknown) =>
  value === undefined || value === '' ? undefined : Number(value);

/**
 * A refused API call as form state: its message, its code (for translating), field issues and
 * the request's reference for support.
 */
export const fail = (result: {
  error: {
    message: string;
    code?: string;
    issues?: { path: string; message: string }[];
    requestId?: string;
  };
}) => ({
  error: result.error.message,
  code: result.error.code,
  issues: result.error.issues,
  requestId: result.error.requestId,
});

/** A notification event as a message key: next-intl keys cannot contain dots. */
export const eventKey = (event: string) => event.replace('.', '_');
