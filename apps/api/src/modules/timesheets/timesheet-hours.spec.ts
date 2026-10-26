import { centi, hoursText, percentages, splitHours } from './timesheet-hours.js';

describe('timesheet hours', () => {
  it('reads and writes hours as hundredths', () => {
    expect(centi('7.50')).toBe(750);
    expect(centi(0.29)).toBe(29);
    expect(hoursText(750)).toBe('7.50');
    expect(hoursText(0)).toBe('0.00');
  });

  it('gives shares that add up to exactly 100', () => {
    expect(percentages([100, 100, 100])).toEqual(['33.34', '33.33', '33.33']);
    expect(percentages([600, 200])).toEqual(['75.00', '25.00']);
    expect(percentages([0, 0])).toEqual(['0.00', '0.00']);
  });

  it('splits worked hours by planned shares, the rest uncharged', () => {
    expect(
      splitHours(800, [
        { projectId: 'a', percent: '60.00' },
        { projectId: 'b', percent: '25.00' },
      ]),
    ).toEqual([
      { projectId: 'a', hundredths: 480 },
      { projectId: 'b', hundredths: 200 },
      { projectId: null, hundredths: 120 },
    ]);
    // A full split has nothing left over, however the hundredths fall.
    const thirds = splitHours(100, [
      { projectId: 'a', percent: '33.33' },
      { projectId: 'b', percent: '33.33' },
      { projectId: 'c', percent: '33.34' },
    ]);
    expect(thirds.reduce((sum, p) => sum + p.hundredths, 0)).toBe(100);
    expect(thirds.every((p) => p.projectId !== null)).toBe(true);
    expect(splitHours(450, [])).toEqual([{ projectId: null, hundredths: 450 }]);
  });
});
