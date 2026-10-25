import { describe, expect, it } from 'vitest';
import { slugSchema } from './schemas.js';
import { slugFrom } from './signup.js';

describe('a workspace address from a company name', () => {
  it('keeps letters and digits, drops company suffixes and joins words with dashes', () => {
    expect(slugFrom('Rupali Knit Wear Ltd')).toBe('rupali-knit-wear');
    expect(slugFrom('Meghna Apparels Limited.')).toBe('meghna-apparels');
    expect(slugFrom('BRAC & Partners (Pvt.) Co.')).toBe('brac-partners');
    expect(slugFrom('A1')).toBe('a1-hr');
  });

  it('always gives a valid address, even from Bangla or a long name', () => {
    for (const name of [
      'মেঘনা অ্যাপারেলস',
      'X',
      'The Very Long Name Of A Group Of Companies In Dhaka Ltd',
    ]) {
      expect(slugSchema.safeParse(slugFrom(name)).success).toBe(true);
    }
  });
});
