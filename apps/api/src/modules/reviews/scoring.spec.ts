import { DEFAULT_RATING_GUIDE } from '@gp/shared';
import { distribution, goalScore, peerSummary } from './scoring.js';

describe('goal score', () => {
  it('averages the ratings by the goals’ weights', () => {
    const goals = [
      { id: 'a', weight: '50.00' },
      { id: 'b', weight: '30.00' },
      { id: 'c', weight: '20.00' },
    ];
    // 4×0.5 + 3×0.3 + 5×0.2 = 3.9
    expect(goalScore(goals, { a: { rating: 4 }, b: { rating: 3 }, c: { rating: 5 } })).toBe('3.90');
  });

  it('weighs goals equally when none carries a weight', () => {
    const goals = [
      { id: 'a', weight: null },
      { id: 'b', weight: null },
      { id: 'c', weight: null },
    ];
    expect(goalScore(goals, { a: { rating: 4 }, b: { rating: 3 }, c: { rating: 4 } })).toBe('3.67');
  });

  it('counts only the rated goals, re-weighing the rest', () => {
    const goals = [
      { id: 'a', weight: 60 },
      { id: 'b', weight: 40 },
    ];
    expect(goalScore(goals, { b: { rating: 2 } })).toBe('2.00');
  });

  it('is null without goals or ratings', () => {
    expect(goalScore([], {})).toBeNull();
    expect(goalScore([{ id: 'a', weight: '100' }], {})).toBeNull();
  });
});

describe('distribution', () => {
  it('counts each rating, in percent of those given, beside the guide', () => {
    const rows = distribution([3, 3, 4, 2, null, 3, 5, 3], DEFAULT_RATING_GUIDE);
    expect(rows).toEqual([
      { rating: 1, count: 0, percent: 0, guidePercent: 5 },
      { rating: 2, count: 1, percent: 14.3, guidePercent: 15 },
      { rating: 3, count: 4, percent: 57.1, guidePercent: 50 },
      { rating: 4, count: 1, percent: 14.3, guidePercent: 20 },
      { rating: 5, count: 1, percent: 14.3, guidePercent: 10 },
    ]);
  });

  it('is all zeros before any rating', () => {
    expect(distribution([null, null], DEFAULT_RATING_GUIDE).map((r) => r.percent)).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });
});

const peer = (strengths: string, improvements: string, rating: number) => ({
  answers: { strengths, improvements },
  rating,
});

describe('peer summary', () => {
  it('shows nothing from fewer than three peers', () => {
    expect(peerSummary([peer('Careful', 'Faster', 4), peer('Kind', 'Speak up', 3)])).toEqual({
      shown: false,
      answers: { strengths: [], improvements: [] },
      averageRating: null,
    });
  });

  it('puts the answers together in an order unrelated to who wrote them', () => {
    const summary = peerSummary([
      peer('Zealous on quality', 'Delegate more', 4),
      peer('Always on time', 'Share plans earlier', 5),
      peer('Helps new operators', 'Ask for help', 3),
    ]);
    expect(summary).toEqual({
      shown: true,
      answers: {
        strengths: ['Always on time', 'Helps new operators', 'Zealous on quality'],
        improvements: ['Ask for help', 'Delegate more', 'Share plans earlier'],
      },
      averageRating: 4,
    });
  });
});
