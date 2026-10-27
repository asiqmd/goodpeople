import { FIRST_RESPONSE_HOURS } from '@gp/shared';
import { addSupportHours } from './support-hours.js';

// The week of 22 October 2026 in Dhaka: Thursday 22, Friday 23, Saturday 24, Sunday 25,
// Monday 26, ... Thursday 29, Sunday 1 November.
const dhaka = (local: string) => new Date(`${local}+06:00`);
const due = (from: string, hours: number) => addSupportHours(dhaka(from), hours).toISOString();
const at = (local: string) => dhaka(local).toISOString();

describe('addSupportHours', () => {
  it('counts within one working day', () => {
    expect(due('2026-10-25T10:00:00', 2)).toBe(at('2026-10-25T12:00:00'));
    expect(due('2026-10-26T10:15:30', 1)).toBe(at('2026-10-26T11:15:30'));
    expect(due('2026-10-26T10:00:00', 0.5)).toBe(at('2026-10-26T10:30:00'));
  });

  it('starts counting at 9:00 when opened before it', () => {
    expect(due('2026-10-25T07:00:00', 2)).toBe(at('2026-10-25T11:00:00'));
    expect(due('2026-10-26T00:00:00', 1)).toBe(at('2026-10-26T10:00:00'));
  });

  it('moves to the next working morning when opened after 18:00', () => {
    expect(due('2026-10-25T19:00:00', 2)).toBe(at('2026-10-26T11:00:00'));
    expect(due('2026-10-26T23:59:00', 1)).toBe(at('2026-10-27T10:00:00'));
  });

  it('carries Thursday evening over the weekend into Sunday', () => {
    expect(due('2026-10-22T17:00:00', 2)).toBe(at('2026-10-25T10:00:00'));
    expect(due('2026-10-22T20:00:00', 1)).toBe(at('2026-10-25T10:00:00'));
    expect(due('2026-10-22T12:00:00', 16)).toBe(at('2026-10-26T10:00:00'));
  });

  it('waits for Sunday when opened on Friday or Saturday', () => {
    expect(due('2026-10-23T10:00:00', 4)).toBe(at('2026-10-25T13:00:00'));
    expect(due('2026-10-24T08:00:00', 1)).toBe(at('2026-10-25T10:00:00'));
    expect(due('2026-10-24T23:59:59', 8)).toBe(at('2026-10-25T17:00:00'));
  });

  it('treats the edges of the day exactly', () => {
    expect(due('2026-10-25T09:00:00', 1)).toBe(at('2026-10-25T10:00:00'));
    expect(due('2026-10-25T18:00:00', 1)).toBe(at('2026-10-26T10:00:00'));
    // A target that ends on the stroke of 18:00 is due then, not the next morning.
    expect(due('2026-10-25T16:00:00', 2)).toBe(at('2026-10-25T18:00:00'));
    expect(due('2026-10-25T09:00:00', 9)).toBe(at('2026-10-25T18:00:00'));
    expect(due('2026-10-29T17:59:00', 1 / 60)).toBe(at('2026-10-29T18:00:00'));
  });

  it('spans several days and weeks', () => {
    expect(due('2026-10-25T09:00:00', 16)).toBe(at('2026-10-26T16:00:00'));
    // Five full working days, Sunday to Thursday.
    expect(due('2026-10-25T09:00:00', 45)).toBe(at('2026-10-29T18:00:00'));
    expect(due('2026-10-25T09:00:00', 46)).toBe(at('2026-11-01T10:00:00'));
    expect(due('2026-10-23T12:00:00', 90)).toBe(at('2026-11-05T18:00:00'));
  });

  it('works from UTC instants near midnight', () => {
    // 02:00 UTC is 08:00 in Dhaka; 20:00 UTC on Saturday is 02:00 on Sunday in Dhaka.
    expect(addSupportHours(new Date('2026-10-25T02:00:00Z'), 1).toISOString()).toBe(
      '2026-10-25T04:00:00.000Z',
    );
    expect(addSupportHours(new Date('2026-10-24T20:00:00Z'), 1).toISOString()).toBe(
      '2026-10-25T04:00:00.000Z',
    );
  });

  it('gives a later target for a slower plan and a sooner one for urgent', () => {
    const opened = '2026-10-26T10:00:00';
    expect(due(opened, FIRST_RESPONSE_HOURS.enterprise.urgent)).toBe(at('2026-10-26T11:00:00'));
    expect(due(opened, FIRST_RESPONSE_HOURS.business.normal)).toBe(at('2026-10-26T14:00:00'));
    expect(due(opened, FIRST_RESPONSE_HOURS.starter.normal)).toBe(at('2026-10-27T17:00:00'));
  });
});
