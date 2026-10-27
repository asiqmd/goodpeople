import { describe, expect, it, vi } from 'vitest';
import { searchArticles, tokenize } from './search';

vi.mock('server-only', () => ({}));
const { helpArticles } = await import('./content');

describe('help search', () => {
  it('splits words on spaces and punctuation, the danda too, and folds case', () => {
    expect(tokenize('বেতন।ছুটি, Payslip! Two-step (TOTP)')).toEqual([
      'বেতন',
      'ছুটি',
      'payslip',
      'two',
      'step',
      'totp',
    ]);
    // Vowel signs, the virama and joiners stay inside a word.
    expect(tokenize('কর্মী র‍্যাব ৩০ দিন॥')).toEqual(['কর্মী', 'র্যাব', '৩০', 'দিন']);
  });

  const items = [
    { slug: 'a', title: 'Run payroll', summary: 'A month for a pay group.', body: 'Lock it.' },
    { slug: 'b', title: 'Payslips', summary: 'Publishing payslips.', body: 'After a payroll run.' },
    { slug: 'c', title: 'বেতন বিবরণী', summary: 'প্রকাশ।', body: 'বেতনের হিসাব।' },
  ];

  it('needs every word, matches word beginnings and ranks titles first', () => {
    expect(searchArticles(items, 'payroll').map((i) => i.slug)).toEqual(['a', 'b']);
    expect(searchArticles(items, 'PAYSLIP').map((i) => i.slug)).toEqual(['b']);
    expect(searchArticles(items, 'payroll lock').map((i) => i.slug)).toEqual(['a']);
    expect(searchArticles(items, 'payroll nothing-like-this')).toEqual([]);
    expect(searchArticles(items, 'বেতন').map((i) => i.slug)).toEqual(['c']);
    expect(searchArticles(items, '  ।  ')).toEqual([]);
  });

  it('finds the real articles in English and in Bangla', () => {
    const en = searchArticles(helpArticles('en'), 'payslips');
    expect(en[0]?.slug).toBe('payslips');
    const bn = searchArticles(helpArticles('bn'), 'কিয়স্ক');
    expect(bn[0]?.slug).toBe('kiosks');
    expect(searchArticles(helpArticles('bn'), 'বেতন').map((a) => a.slug)).toContain('run-payroll');
    expect(searchArticles(helpArticles('en'), 'zzzz-nothing')).toEqual([]);
  });
});
