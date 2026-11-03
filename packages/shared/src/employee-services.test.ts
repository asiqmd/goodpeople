import { describe, expect, it } from 'vitest';
import {
  addSurveyResponse,
  announcementSchema,
  assetIssueSchema,
  emptySurveyTotals,
  surveyResponseSchema,
  surveyResults,
  surveySchema,
} from './employee-services.js';
describe('anonymous survey aggregates and service contracts', () => {
  it('suppresses small and live cohorts, including a caller-supplied lower threshold', () => {
    let totals = emptySurveyTotals(1);
    for (let i = 0; i < 4; i++) totals = addSurveyResponse(totals, { enps: 10, scores: [5] });
    expect(surveyResults(totals, 10, 1, true)).toEqual({ suppressed: true, minimum: 5 });
    totals = addSurveyResponse(totals, { enps: 0, scores: [1] });
    expect(surveyResults(totals, 10, 5, false)).toEqual({ suppressed: true, minimum: 5 });
    expect(surveyResults(totals, 10, 6, true)).toEqual({ suppressed: true, minimum: 6 });
  });
  it('calculates eNPS and distributions without retaining answers or changing its input', () => {
    const original = emptySurveyTotals(1);
    let totals = original;
    [0, 6, 7, 9, 10].forEach(
      (enps, i) => (totals = addSurveyResponse(totals, { enps, scores: [i + 1] })),
    );
    expect(original.enps.every((n) => n === 0)).toBe(true);
    expect(surveyResults(totals, 12, 5, true)).toEqual({
      suppressed: false,
      responses: 5,
      eligible: 12,
      promoters: 2,
      passives: 1,
      detractors: 2,
      enps: 0,
      questions: [{ mean: 3, distribution: [1, 1, 1, 1, 1] }],
    });
    expect(() => addSurveyResponse(totals, { enps: 10, scores: [] })).toThrow();
  });
  it('rejects proxy identifiers, invalid scores, missing policy due dates and impossible asset dates', () => {
    expect(
      surveyResponseSchema.safeParse({ enps: 10, scores: [], employeeId: 'proxy' }).success,
    ).toBe(false);
    expect(surveyResponseSchema.safeParse({ enps: 11, scores: [0] }).success).toBe(false);
    expect(surveySchema.shape.threshold.safeParse(4).success).toBe(false);
    expect(
      announcementSchema.safeParse({
        legalEntityId: '00000000-0000-4000-8000-000000000001',
        title: 'Policy',
        titleBn: 'Policy',
        body: 'Read this',
        bodyBn: 'Read this',
        requiresAcknowledgement: true,
      }).success,
    ).toBe(false);
    expect(
      assetIssueSchema.safeParse({
        employeeCode: 'AA',
        issuedOn: '2026-11-02',
        dueOn: '2026-11-01',
        condition: 'Good',
      }).success,
    ).toBe(false);
  });
});
