import { createHmac, timingSafeEqual } from 'node:crypto';

/** Reference receiver verifier. Keep the original bytes before any JSON middleware.
 * Keys are receiver-side bindings; the secret is used as UTF-8 text, not base64-decoded.
 * After verification, durably INSERT (tenant_id,event_id,body) ON CONFLICT DO NOTHING
 * in your inbox transaction, COMMIT, then return 2xx. Process that inbox independently.
 */
export function verifyWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  keys: Map<string, { secret: string; tenantId: string; subscriptionId: string }>,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = (name: string) => {
    const value = headers[name];
    if (typeof value !== 'string') throw new Error('invalid_webhook');
    return value;
  };
  const keyId = header('gp-key-id'),
    stamp = header('gp-timestamp');
  const eventId = header('gp-event-id'),
    deliveryId = header('gp-delivery-id');
  const signature = header('gp-signature'),
    binding = keys.get(keyId);
  if (
    !binding ||
    rawBody.length > 16384 ||
    !/^\d{10}$/.test(stamp) ||
    Math.abs(nowSeconds - Number(stamp)) > 300 ||
    !/^v1=[0-9a-f]{64}$/.test(signature)
  )
    throw new Error('invalid_webhook');
  const expected = createHmac('sha256', binding.secret)
    .update(`v1.${keyId}.${stamp}.${eventId}.${deliveryId}.`)
    .update(rawBody)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(3), 'hex')))
    throw new Error('invalid_webhook');
  const envelope = JSON.parse(rawBody.toString('utf8')) as {
    id: string;
    tenant_id: string;
    schema_version: string;
    type: string;
  };
  if (
    envelope.id !== eventId ||
    envelope.tenant_id !== binding.tenantId ||
    envelope.schema_version !== '1' ||
    header('gp-subscription-id') !== binding.subscriptionId ||
    ![
      'employee.created',
      'employee.updated',
      'employment.ended',
      'attendance.day.finalized',
    ].includes(envelope.type)
  )
    throw new Error('invalid_webhook');
  return envelope;
}
