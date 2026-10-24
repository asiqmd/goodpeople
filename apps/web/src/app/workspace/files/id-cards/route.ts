import { proxyFile } from '@/lib/api';

/** Printable ID cards for the employees ticked on the ID cards page. */
export async function POST(request: Request) {
  const form = await request.formData();
  const validUntil = String(form.get('validUntil') ?? '');
  return proxyFile('/tenant/id-cards', {
    method: 'POST',
    body: {
      employeeIds: form.getAll('employeeIds').map(String),
      language: form.get('language') === 'bn' ? 'bn' : 'en',
      ...(validUntil ? { validUntil } : {}),
    },
  });
}
