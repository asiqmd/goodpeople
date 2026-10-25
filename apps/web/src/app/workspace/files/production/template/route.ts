import { proxyFile } from '@/lib/api';

/** The CSV template for importing production. */
export function GET() {
  return proxyFile('/tenant/production/import/template');
}
