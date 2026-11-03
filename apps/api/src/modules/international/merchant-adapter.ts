import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { merchantLedger, type Tx } from '@gp/db';
import { and, eq, sql } from 'drizzle-orm';
/** Contract harness only: no production merchant has been selected or qualified. */
export interface MerchantAdapter {
  provider: string;
  verify(raw: Buffer, signature: string, now: Date): MerchantEvent;
  checkout(priceId: string): Promise<never>;
}
const eventSchema = z
  .object({
    id: z.string().min(1).max(100),
    tenantId: z.uuid(),
    kind: z.enum(['payment', 'refund', 'credit', 'reconciliation']),
    currency: z.enum(['USD', 'AED']),
    amount: z.string().regex(/^\d{1,10}\.\d{2}$/),
    invoice: z.string().min(1).max(120),
    reference: z.string().min(1).max(120),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export type MerchantEvent = z.infer<typeof eventSchema>;
export function testMerchantAdapter(secret: string): MerchantAdapter {
  if (process.env.NODE_ENV !== 'test') throw new Error('No approved production merchant adapter');
  return {
    provider: 'contract-test-only',
    verify(raw, signature, now) {
      const parts = signature.split('.'),
        [timestamp, mac] = parts;
      if (
        parts.length !== 2 ||
        !/^\d+$/.test(timestamp ?? '') ||
        !/^[a-f0-9]{64}$/.test(mac ?? '') ||
        Math.abs(now.getTime() - Number(timestamp) * 1000) > 300000
      )
        throw new Error('Invalid merchant callback');
      const expected = createHmac('sha256', secret)
        .update(timestamp + '.')
        .update(raw)
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(mac!, 'hex')))
        throw new Error('Invalid merchant signature');
      return eventSchema.parse(JSON.parse(raw.toString('utf8')));
    },
    async checkout() {
      throw new Error('merchant_review_pending');
    },
  };
}
const minor = (value: string) => BigInt(value.replace('.', ''));
/** Verify the exact bytes before acquiring invoice and event locks. Duplicate ids with different bytes are conflicts. */
export async function recordMerchantEvent(
  tx: Tx,
  adapter: MerchantAdapter,
  raw: Buffer,
  signature: string,
  now = new Date(),
) {
  const event = adapter.verify(raw, signature, now),
    hash = createHash('sha256').update(raw).digest('hex');
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${adapter.provider + ':' + event.tenantId + ':' + event.invoice},54))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${adapter.provider + ':' + event.id},54))`,
  );
  const [prior] = await tx
    .select()
    .from(merchantLedger)
    .where(
      and(eq(merchantLedger.provider, adapter.provider), eq(merchantLedger.eventId, event.id)),
    );
  if (prior) {
    if (prior.payloadHash !== hash || prior.tenantId !== event.tenantId)
      throw new Error('merchant_event_payload_conflict');
    return { accepted: true, duplicate: true };
  }
  const history = await tx
    .select()
    .from(merchantLedger)
    .where(
      and(
        eq(merchantLedger.provider, adapter.provider),
        eq(merchantLedger.tenantId, event.tenantId),
        eq(merchantLedger.externalInvoice, event.invoice),
      ),
    );
  if (history.some((row) => row.currency !== event.currency))
    throw new Error('merchant_invoice_currency_mismatch');
  const paid = history
      .filter((r) => r.kind === 'payment')
      .reduce((sum, r) => sum + minor(r.amount), 0n),
    returned = history
      .filter((r) => r.kind === 'refund' || r.kind === 'credit')
      .reduce((sum, r) => sum + minor(r.amount), 0n);
  if (
    (event.kind === 'refund' || event.kind === 'credit') &&
    (minor(event.amount) === 0n || returned + minor(event.amount) > paid)
  )
    throw new Error('merchant_return_exceeds_payment');
  if (
    event.kind === 'reconciliation' &&
    (!history.some((r) => r.kind === 'payment') || minor(event.amount) !== paid - returned)
  )
    throw new Error('merchant_reconciliation_mismatch');
  await tx.insert(merchantLedger).values({
    tenantId: event.tenantId,
    provider: adapter.provider,
    eventId: event.id,
    kind: event.kind,
    currency: event.currency,
    amount: event.amount,
    externalInvoice: event.invoice,
    externalReference: event.reference,
    occurredAt: new Date(event.occurredAt),
    payloadHash: hash,
    reconciled: event.kind === 'reconciliation',
  });
  return { accepted: true, duplicate: false };
}
