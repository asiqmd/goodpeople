import { describe, expect, it } from 'vitest';
import { fillTemplate, placeholdersIn, sniffContentType } from './lifecycle.js';
import { documentUploadSchema, separationInputSchema } from './lifecycle-schemas.js';

describe('file types', () => {
  it('recognises PDFs and images by their first bytes, not their names', () => {
    expect(sniffContentType(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffContentType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffContentType(new TextEncoder().encode('RIFF\0\0\0\0WAVEfmt '))).toBeNull();
    expect(sniffContentType(new TextEncoder().encode('<html>'))).toBeNull();
  });
});

describe('letter templates', () => {
  it('fills placeholders and reports the ones without a value', () => {
    const result = fillTemplate('Dear {{employee.name}}, Tk {{ extra.grossWages }} from {{x.y}}', {
      'employee.name': 'Rahima Khatun',
      'x.y': '',
    });
    expect(result.text).toBe('Dear Rahima Khatun, Tk {{ extra.grossWages }} from {{x.y}}');
    expect(result.missing).toEqual(['extra.grossWages', 'x.y']);
  });

  it('lists the placeholders a template uses', () => {
    expect(placeholdersIn('{{a.b}} {{extra.c}} {{a.b}} {{not a field}}')).toEqual([
      'a.b',
      'extra.c',
    ]);
  });
});

describe('lifecycle input', () => {
  it('reads form booleans and refuses expiry before issue', () => {
    expect(
      documentUploadSchema.parse({
        category: 'nid',
        title: 'National ID',
        visibleToEmployee: 'true',
      }).visibleToEmployee,
    ).toBe(true);
    expect(
      documentUploadSchema.safeParse({
        category: 'passport',
        title: 'Passport',
        issuedOn: '2026-01-01',
        expiresOn: '2025-01-01',
      }).success,
    ).toBe(false);
    expect(documentUploadSchema.safeParse({ category: 'letter', title: 'Made up' }).success).toBe(
      false,
    );
  });

  it('keeps the last working day on or after the notice', () => {
    const base = { type: 'resignation', reason: 'Moving to Chattogram' };
    expect(
      separationInputSchema.safeParse({
        ...base,
        noticeDate: '2026-10-24',
        lastWorkingDay: '2026-10-20',
      }).success,
    ).toBe(false);
  });
});
