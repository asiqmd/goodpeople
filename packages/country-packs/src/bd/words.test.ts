import { describe, expect, it } from 'vitest';
import { takaInWords } from './words.js';

describe('takaInWords', () => {
  it('counts in lakhs and crores, in English', () => {
    expect(takaInWords('12500', 'en')).toBe('Taka twelve thousand five hundred only');
    expect(takaInWords('100000', 'en')).toBe('Taka one lakh only');
    expect(takaInWords('1234567', 'en')).toBe(
      'Taka twelve lakh thirty-four thousand five hundred and sixty-seven only',
    );
    expect(takaInWords('25000000', 'en')).toBe('Taka two crore fifty lakh only');
    expect(takaInWords('15.50', 'en')).toBe('Taka fifteen and fifty paisa only');
    expect(takaInWords('0', 'en')).toBe('Taka zero only');
  });

  it('uses the Bangla word for every number under a hundred', () => {
    expect(takaInWords('12500', 'bn')).toBe('বারো হাজার পাঁচ শত টাকা মাত্র');
    expect(takaInWords('14150', 'bn')).toBe('চৌদ্দ হাজার এক শত পঞ্চাশ টাকা মাত্র');
    expect(takaInWords('9875', 'bn')).toBe('নয় হাজার আট শত পঁচাত্তর টাকা মাত্র');
    expect(takaInWords('100000', 'bn')).toBe('এক লক্ষ টাকা মাত্র');
    expect(takaInWords('9999999', 'bn')).toBe(
      'নিরানব্বই লক্ষ নিরানব্বই হাজার নয় শত নিরানব্বই টাকা মাত্র',
    );
    expect(takaInWords('20.05', 'bn')).toBe('বিশ টাকা পাঁচ পয়সা মাত্র');
  });

  it('refuses what cannot be paid', () => {
    expect(() => takaInWords('-1', 'en')).toThrow();
  });
});
