import type { UaePilotResult, UaeWpsEventInput } from '@gp/shared';
import { aedAmount, aedMinor, UaeBoundaryError } from './calculator.js';
import { uaeHash } from './manifest.js';
import { createHash } from 'node:crypto';
export const UAE_WPS_ADAPTER = {
  version: 'ei-public-guide-candidate.1',
  status: 'needs_bank_acceptance',
  source:
    'https://www.emiratesislamic.ae/-/media/ei/pdfs/business-online/salary-and-utility-payments/ei_businessonline_salary_wps_file_creation_user_guide.pdf',
  sourceDocumentHash: 'f4f3c9f2658a9b8a58efa84371539ed3de9458527e7ed2f8bfeb35d502d87695',
  downloadedOn: '2026-11-02',
  approvedAgent: null,
  approvedSchema: null,
} as const;
const fail = (code: string): never => {
  throw new UaeBoundaryError(code);
};
export function syntheticUaeWps(result: UaePilotResult, from: string, to: string, created: Date) {
  if (
    result.mode !== 'preview' ||
    result.kind !== 'payroll' ||
    result.currency !== 'AED' ||
    !result.lines.length
  )
    fail('uae_wps_preview_payroll_required');
  const rows: string[] = ['SANDBOX ONLY - NOT FOR BANK UPLOAD - NOT PROOF OF PAYMENT'];
  let total = 0n;
  for (const [i, line] of result.lines.entries()) {
    if (line.currency !== 'AED') fail('uae_wps_currency_mismatch');
    const variable = aedMinor(line.components.find((c) => c.code === 'OVERTIME')?.amount ?? '0.00');
    const fixed = aedMinor(line.net) - variable;
    if (fixed < 0n || fixed + variable <= 0n) fail('uae_wps_positive_income_required');
    // Never read, decrypt or substitute real bank/permit identifiers in this sandbox.
    const worker = 'SYNTH' + String(i + 1).padStart(9, '0');
    rows.push(
      [
        'EDR',
        worker,
        '000000000',
        'AE070331234567890123456',
        from,
        to,
        String(line.facts.employedDays),
        aedAmount(fixed),
        aedAmount(variable),
        String(line.facts.unpaidDays),
      ].join(','),
    );
    if (variable)
      rows.push(
        [
          'EVP',
          worker,
          '000000000',
          aedAmount(variable),
          '0.00',
          '0.00',
          '0.00',
          '0.00',
          '0.00',
          '0.00',
        ].join(','),
      );
    total += fixed + variable;
  }
  if (aedAmount(total) !== result.total) fail('uae_wps_total_mismatch');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(created)
      .map((p) => [p.type, p.value]),
  );
  const createdOn = `${parts.year}-${parts.month}-${parts.day}`;
  rows.push(
    [
      'SCR',
      '0000000000000',
      '000000000',
      createdOn,
      `${parts.hour}${parts.minute}`,
      from.slice(5, 7) + from.slice(0, 4),
      String(result.lines.length),
      aedAmount(total),
      'AED',
      'SANDBOX-NOT-FOR-UPLOAD',
    ].join(','),
  );
  const file = rows.join('\r\n') + '\r\n';
  return {
    mode: 'synthetic' as const,
    adapterVersion: UAE_WPS_ADAPTER.version,
    file,
    fileHash: createHash('sha256').update(file).digest('hex'),
    count: result.lines.length,
    total: aedAmount(total),
    filename: `SANDBOX-${from.slice(0, 7)}-NOT-FOR-UPLOAD.txt`,
    paymentProven: false,
  };
}
export function nextUaeWpsState(
  current: string,
  event: UaeWpsEventInput,
  batch: { fileHash: string; count: number; total: string },
) {
  if (event.fileHash !== batch.fileHash) fail('uae_wps_file_hash_mismatch');
  if (event.acceptedCount + event.rejectedCount > batch.count)
    fail('uae_wps_return_count_mismatch');
  if (event.kind === 'uploaded') {
    if (
      current !== 'draft' ||
      event.acceptedCount ||
      event.rejectedCount ||
      aedMinor(event.returnedTotal)
    )
      fail('uae_wps_invalid_upload_state');
  } else if (event.kind === 'accepted') {
    if (
      current !== 'uploaded' ||
      event.acceptedCount !== batch.count ||
      event.rejectedCount ||
      aedMinor(event.returnedTotal) !== aedMinor(batch.total)
    )
      fail('uae_wps_acceptance_mismatch');
  } else if (event.kind === 'rejected') {
    if (
      current !== 'uploaded' ||
      !event.rejectedCount ||
      event.acceptedCount + event.rejectedCount !== batch.count ||
      aedMinor(event.returnedTotal) > aedMinor(batch.total)
    )
      fail('uae_wps_rejection_mismatch');
  } else if (
    current !== 'accepted' ||
    event.acceptedCount !== batch.count ||
    event.rejectedCount ||
    aedMinor(event.returnedTotal) !== aedMinor(batch.total)
  )
    fail('uae_wps_reconciliation_mismatch');
  return { state: event.kind, payloadHash: uaeHash(event), paymentProven: false };
}
