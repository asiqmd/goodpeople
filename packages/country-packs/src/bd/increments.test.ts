import { describe, expect, it } from 'vitest';
import { bdRmgIncrement } from './increments.js';

describe('effective-dated RMG annual increments', () => {
  it('keeps the award and later addition separate in time and awaiting counsel review', () => {
    expect(bdRmgIncrement('2023-11-30')).toBeNull();
    expect(bdRmgIncrement('2024-11-30')?.percentOfBasic).toBe('5');
    expect(bdRmgIncrement('2024-12-01')).toMatchObject({
      percentOfBasic: '9',
      reviewStatus: 'needs_review',
    });
    expect(bdRmgIncrement('2026-11-01')?.minServiceMonths).toBe(12);
  });
});
