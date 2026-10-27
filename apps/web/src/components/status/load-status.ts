import 'server-only';
import type { PublicStatus } from '@gp/shared';
import { API_URL } from '@/lib/api';

/**
 * The public status, or null when the API cannot be reached or is slow to answer. Every
 * workspace page asks (for the banner), so it must never hold a page up or break it.
 */
export async function loadPublicStatus(): Promise<PublicStatus | null> {
  try {
    const res = await fetch(`${API_URL}/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok ? ((await res.json()) as PublicStatus) : null;
  } catch {
    return null;
  }
}
