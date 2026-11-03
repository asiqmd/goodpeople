'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { InternationalOverview } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import type { InternationalState } from './international';
const value = (form: FormData, key: string) => String(form.get(key) ?? '');
export async function hireInternationalEmployee(
  _: InternationalState,
  form: FormData,
): Promise<InternationalState> {
  const company = value(form, 'legalEntityId'),
    overview = await authedFetch<InternationalOverview>('tenant', '/tenant/international');
  if (!overview.ok) return { error: overview.error.message };
  const profile = overview.data.profiles.find((p) => p.legalEntityId === company && !p.effectiveTo);
  if (!profile || !['AE', 'SA'].includes(profile.countryCode))
    return { error: 'Choose an explicitly registered AE or SA employer' };
  const address = {
    line: value(form, 'addressLine'),
    district: value(form, 'city'),
    division: value(form, 'region'),
    countryCode: value(form, 'addressCountry').toUpperCase(),
  };
  const result = await authedFetch<{ employee: { id: string } }>('tenant', '/tenant/employees', {
    method: 'POST',
    body: {
      employmentCountry: profile.countryCode,
      nationality: value(form, 'citizenship').toUpperCase(),
      employeeCode: value(form, 'employeeCode'),
      fullName: value(form, 'originalName'),
      dateOfBirth: value(form, 'dateOfBirth'),
      gender: value(form, 'gender'),
      mobilePhone: value(form, 'phone'),
      presentAddress: address,
      permanentAddress: address,
      identity: {},
      joinedOn: value(form, 'joinedOn'),
      job: {
        legalEntityId: company,
        employmentType: value(form, 'contractClass'),
        workerCategory: value(form, 'workerCategory'),
      },
    },
  });
  if (!result.ok) return { error: result.error.message };
  redirect('/workspace/international/employees/' + result.data.employee.id);
}
export async function saveInternationalEmployee(
  _: InternationalState,
  form: FormData,
): Promise<InternationalState> {
  const employeeId = value(form, 'employeeId'),
    op = value(form, 'op');
  let body: Record<string, unknown>;
  if (op === 'identifiers') {
    body = {
      employeeId,
      kind: value(form, 'kind'),
      issuer: value(form, 'issuer').toUpperCase(),
      value: value(form, 'identifierValue'),
      ...(value(form, 'validTo') ? { validTo: value(form, 'validTo') } : {}),
    };
  } else if (op === 'banks') {
    body = {
      employeeId,
      legalEntityId: value(form, 'legalEntityId'),
      provider: value(form, 'provider'),
      accountName: value(form, 'accountName'),
      destination: {
        country: value(form, 'country'),
        currency: value(form, 'currency'),
        iban: value(form, 'iban'),
      },
    };
  } else if (op === 'employment-profiles') {
    body = {
      employeeId,
      ...Object.fromEntries(
        [
          'effectiveFrom',
          'citizenship',
          'insuranceClass',
          'contractClass',
          'originalName',
          'reason',
        ].map((key) => [key, value(form, key)]),
      ),
      ...Object.fromEntries(
        ['translatedName', 'suppliedHijriDate', 'calendarProvenance']
          .filter((key) => value(form, key))
          .map((key) => [key, value(form, key)]),
      ),
    };
  } else return { error: 'Unknown operation' };
  const result = await authedFetch('tenant', '/tenant/international/' + op, {
    method: 'POST',
    body,
  });
  if (!result.ok) return { error: result.error.message };
  revalidatePath('/workspace/international/employees/' + employeeId);
  return { ok: true };
}
