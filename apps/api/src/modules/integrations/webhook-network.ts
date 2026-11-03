import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import { publicAddress } from '../identity/oidc-network.js';
import { integrationError } from './public-auth.js';
async function target(raw: string, privateHosts: string, testing: boolean) {
  const url = new URL(raw),
    host = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = privateHosts
    .split(',')
    .map((h) => h.trim())
    .includes(host);
  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.protocol !== 'https:' && !(testing && allowed && url.protocol === 'http:'))
  )
    integrationError(
      400,
      'invalid_webhook_url',
      'Use HTTPS without credentials, query or fragment',
    );
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await Promise.race([
        lookup(host, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error('DNS lookup timed out')), 2000);
          timer.unref();
        }),
      ]);
  if (!addresses.length || (!allowed && addresses.some((a) => !publicAddress(a.address))))
    integrationError(
      400,
      'invalid_webhook_url',
      'Webhook target is not a permitted public address',
    );
  return { url, address: addresses[0]! };
}
export async function validateWebhookTarget(raw: string, hosts: string, testing = false) {
  try {
    await target(raw, hosts, testing);
  } catch (error) {
    if (error instanceof Error && 'getStatus' in error) throw error;
    integrationError(
      400,
      'invalid_webhook_url',
      'Receiver DNS did not resolve to an approved address',
    );
  }
}
export async function postWebhook(
  raw: string,
  hosts: string,
  body: string,
  headers: Record<string, string>,
  testing = false,
): Promise<number> {
  const { url, address } = await target(raw, hosts, testing);
  const agent = new Agent({
    connect: {
      autoSelectFamily: false,
      lookup: (_h, _o, cb) => cb(null, address.address, address.family as 4 | 6),
    },
  });
  try {
    // Match fetch to the custom dispatcher instead of Node's bundled Undici.
    const response = await undiciFetch(url, {
      method: 'POST',
      body,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      dispatcher: agent,
    } as UndiciRequestInit);
    let size = 0;
    if (response.body)
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 65536) throw new Error('Webhook response exceeded limit');
      }
    // Redirects are failures; never follow them with a payload or signature.
    return response.status;
  } finally {
    await agent.destroy();
  }
}
