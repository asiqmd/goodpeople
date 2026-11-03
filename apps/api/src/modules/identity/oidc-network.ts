import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import type { CustomFetch } from 'openid-client';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number];
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19].includes(b))
    );
  }
  // Only global unicast IPv6; mapped IPv4, loopback, link/site-local and multicast fail closed.
  return (
    isIP(address) === 6 && /^[23][0-9a-f]{0,3}:/i.test(address) && !/^2001:db8:/i.test(address)
  );
}
/** DNS is checked and pinned to the socket; redirects and unbounded responses are refused. */
export function oidcFetch(privateHosts: string, testing = false): CustomFetch {
  const allowed = new Set(
    privateHosts
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return async (target, options) => {
    const url = new URL(target),
      host = url.hostname.replace(/^\[|\]$/g, '');
    const privateAllowed = allowed.has(host);
    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== 'https:' && !(testing && privateAllowed && url.protocol === 'http:'))
    )
      throw new Error('OIDC endpoint must use HTTPS');
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || (!privateAllowed && addresses.some((a) => !publicAddress(a.address))))
      throw new Error('OIDC endpoint is not a public address');
    const address = addresses[0]!;
    const agent = new Agent({
      connect: {
        autoSelectFamily: false,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family as 4 | 6),
      },
    });
    try {
      // Keep fetch and its custom dispatcher on the same Undici version (Node 24 bundles an older one).
      const response = await undiciFetch(url, {
        ...options,
        dispatcher: agent,
        redirect: 'manual',
        signal: AbortSignal.any([
          AbortSignal.timeout(5000),
          ...(options.signal ? [options.signal] : []),
        ]),
      } as UndiciRequestInit);
      if (response.status >= 300 && response.status < 400)
        throw new Error('OIDC redirects are not allowed');
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (response.body)
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > 1024 * 1024) throw new Error('OIDC response too large');
          chunks.push(chunk);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new Response(bytes.buffer, {
        status: response.status,
        headers: [...response.headers.entries()],
      });
    } finally {
      await agent.close();
    }
  };
}
