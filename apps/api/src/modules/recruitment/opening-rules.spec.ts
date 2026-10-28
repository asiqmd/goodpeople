import type { HttpException } from '@nestjs/common';
import type { OpeningStatus } from '@gp/shared';
import { openingActions, refusal, type OpeningActor, type OpeningState } from './opening-rules.js';

const TODAY = '2026-10-28';
const HR: OpeningActor = { manage: true, creator: false };
const DRAFTER: OpeningActor = { manage: false, creator: true };
const OTHER: OpeningActor = { manage: false, creator: false };

const opening = (status: OpeningStatus, fields: Partial<OpeningState> = {}): OpeningState => ({
  status,
  closesOn: '2026-11-30',
  hired: 0,
  ...fields,
});

const codeOf = (e: HttpException | null) => (e ? (e.getResponse() as { code: string }).code : null);

describe('what may happen to an opening', () => {
  it('lets HR and the drafter change and submit a draft or a rejected one, and nobody else', () => {
    for (const status of ['draft', 'rejected'] as const) {
      expect(openingActions(opening(status), HR, TODAY)).toEqual(['edit', 'submit', 'cancel']);
      expect(openingActions(opening(status), DRAFTER, TODAY)).toEqual(['edit', 'submit', 'cancel']);
      expect(openingActions(opening(status), OTHER, TODAY)).toEqual([]);
    }
    expect(codeOf(refusal('edit', opening('draft'), OTHER, TODAY))).toBe('role_not_allowed');
    expect(codeOf(refusal('edit', opening('pending_approval'), HR, TODAY))).toBe(
      'opening_not_draft',
    );
    expect(codeOf(refusal('submit', opening('approved'), DRAFTER, TODAY))).toBe(
      'opening_not_draft',
    );
  });

  it('keeps the post and publishing for HR, after approval', () => {
    expect(openingActions(opening('pending_approval'), HR, TODAY)).toEqual(['cancel']);
    expect(codeOf(refusal('post', opening('pending_approval'), HR, TODAY))).toBe(
      'opening_not_approved',
    );
    expect(codeOf(refusal('publish', opening('draft'), HR, TODAY))).toBe('opening_not_approved');
    expect(codeOf(refusal('post', opening('approved'), DRAFTER, TODAY))).toBe('role_not_allowed');
    expect(openingActions(opening('approved'), HR, TODAY)).toEqual(['post', 'publish', 'cancel']);
    expect(openingActions(opening('approved'), DRAFTER, TODAY)).toEqual([]);
    expect(openingActions(opening('open'), HR, TODAY)).toEqual(['post', 'close', 'cancel']);
    expect(codeOf(refusal('publish', opening('open'), HR, TODAY))).toBe('opening_published');
    expect(codeOf(refusal('close', opening('closed'), HR, TODAY))).toBe('opening_not_open');
    expect(codeOf(refusal('reopen', opening('open'), HR, TODAY))).toBe('opening_not_closed');
  });

  it('reopens a closed opening only until its closing date', () => {
    expect(openingActions(opening('closed'), HR, TODAY)).toEqual(['post', 'reopen', 'cancel']);
    expect(refusal('reopen', opening('closed', { closesOn: TODAY }), HR, TODAY)).toBeNull();
    const past = opening('closed', { closesOn: '2026-10-27' });
    expect(codeOf(refusal('reopen', past, HR, TODAY))).toBe('closes_on_past');
    expect(openingActions(past, HR, TODAY)).toEqual(['post', 'cancel']);
  });

  it('cancels before anyone is hired; the drafter only before approval', () => {
    expect(refusal('cancel', opening('pending_approval'), DRAFTER, TODAY)).toBeNull();
    expect(codeOf(refusal('cancel', opening('open'), DRAFTER, TODAY))).toBe('role_not_allowed');
    expect(codeOf(refusal('cancel', opening('open', { hired: 1 }), HR, TODAY))).toBe(
      'opening_has_hire',
    );
    for (const status of ['filled', 'cancelled'] as const) {
      expect(openingActions(opening(status), HR, TODAY)).toEqual([]);
      expect(codeOf(refusal('cancel', opening(status), HR, TODAY))).toBe('opening_finished');
      expect(codeOf(refusal('post', opening(status), HR, TODAY))).toBe('opening_finished');
    }
  });
});
