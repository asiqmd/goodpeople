import { proxyFile } from '@/lib/api';

/** The Excel template for importing employees, with this workspace's codes. */
export function GET() {
  return proxyFile('/tenant/imports/employees/template');
}
