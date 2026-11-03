import type { SaudiPilotResult, SaudiWpsEventInput } from '@gp/shared';
import { sarAmount, sarMinor, SaudiBoundaryError } from './calculator.js';
import { saudiHash } from './manifest.js';
import { createHash } from 'node:crypto';
export const SAUDI_WPS_ADAPTER = {
  version: 'sa-mudad-contract-sandbox.1',
  status: 'needs_bank_acceptance',
  source: 'https://www.hrsd.gov.sa/en/ministry-services/services/رفع-ملف-حماية-الأجور',
  sourceDocumentHash: null,
  downloadedOn: null,
  researchedOn: '2026-11-03',
  approvedAgent: null,
  approvedSchema: null,
} as const;
const fail = (code: string): never => {
  throw new SaudiBoundaryError(code);
};
export function syntheticSaudiWps(
  result: SaudiPilotResult,
  from: string,
  to: string,
  created: Date,
) {
  if (
    result.mode !== 'preview' ||
    result.kind !== 'payroll' ||
    result.currency !== 'SAR' ||
    !result.lines.length
  )
    fail('saudi_wps_preview_payroll_required');
  const rows: string[] = [
    'SANDBOX ONLY - NOT A SEALED BANK FILE - NOT FOR UPLOAD - NOT PROOF OF PAYMENT',
    'INTERNAL_SAUDI_RECONCILIATION_V1,worker,period_start,period_end,currency,basic,allowances,overtime,gross,employee_contribution,other_deductions,net',
  ];
  let total = 0n;
  for (const [i, line] of result.lines.entries()) {
    if (line.currency !== 'SAR') fail('saudi_wps_currency_mismatch');
    const basic = sarMinor(line.components.find((c) => c.code === 'BASIC')?.amount ?? '0'),
      allowances = sarMinor(line.components.find((c) => c.code === 'ALLOWANCES')?.amount ?? '0'),
      overtime = sarMinor(line.components.find((c) => c.code === 'OVERTIME')?.amount ?? '0');
    const gross = sarMinor(line.gross),
      employee = sarMinor(line.employeeContribution),
      deductions = sarMinor(line.deductions),
      net = sarMinor(line.net);
    if (
      basic + allowances + overtime !== gross ||
      gross - employee - deductions !== net ||
      net <= 0n
    )
      fail('saudi_wps_line_reconciliation_mismatch');
    // Internal contract fixture only: no bank, Iqama, national ID or employer identifiers are read.
    rows.push(
      [
        'SYNTH-' + String(i + 1).padStart(4, '0'),
        from,
        to,
        'SAR',
        sarAmount(basic),
        sarAmount(allowances),
        sarAmount(overtime),
        line.gross,
        line.employeeContribution,
        line.deductions,
        line.net,
      ].join(','),
    );
    total += net;
  }
  if (sarAmount(total) !== result.total) fail('saudi_wps_total_mismatch');
  rows.push(
    [
      'INTERNAL_CONTROL',
      String(result.lines.length),
      sarAmount(total),
      'SAR',
      created.toISOString(),
      'NOT-FOR-UPLOAD',
    ].join(','),
  );
  const file = rows.join('\r\n') + '\r\n';
  return {
    mode: 'synthetic' as const,
    adapterVersion: SAUDI_WPS_ADAPTER.version,
    file,
    fileHash: createHash('sha256').update(file).digest('hex'),
    count: result.lines.length,
    total: sarAmount(total),
    filename: `SAUDI-SANDBOX-${from.slice(0, 7)}-NOT-FOR-UPLOAD.txt`,
    paymentProven: false,
  };
}
export function nextSaudiWpsState(
  current: string,
  event: SaudiWpsEventInput,
  batch: { fileHash: string; count: number; total: string },
) {
  if (event.fileHash !== batch.fileHash) fail('saudi_wps_file_hash_mismatch');
  if (event.acceptedCount + event.rejectedCount > batch.count)
    fail('saudi_wps_return_count_mismatch');
  if (event.kind === 'uploaded') {
    if (
      current !== 'draft' ||
      event.acceptedCount ||
      event.rejectedCount ||
      sarMinor(event.returnedTotal)
    )
      fail('saudi_wps_invalid_upload_state');
  } else if (event.kind === 'accepted') {
    if (
      current !== 'uploaded' ||
      event.acceptedCount !== batch.count ||
      event.rejectedCount ||
      sarMinor(event.returnedTotal) !== sarMinor(batch.total)
    )
      fail('saudi_wps_acceptance_mismatch');
  } else if (event.kind === 'rejected') {
    if (
      current !== 'uploaded' ||
      !event.rejectedCount ||
      event.acceptedCount + event.rejectedCount !== batch.count ||
      sarMinor(event.returnedTotal) > sarMinor(batch.total)
    )
      fail('saudi_wps_rejection_mismatch');
  } else if (
    current !== 'accepted' ||
    event.acceptedCount !== batch.count ||
    event.rejectedCount ||
    sarMinor(event.returnedTotal) !== sarMinor(batch.total)
  )
    fail('saudi_wps_reconciliation_mismatch');
  return { state: event.kind, payloadHash: saudiHash(event), paymentProven: false };
}
