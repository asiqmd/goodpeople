import type { HttpException } from '@nestjs/common';
import type { OpeningAction, OpeningStatus } from '@gp/shared';
import { conflict, forbidden } from '../../common/errors.js';

// What may happen to an opening, by its status and who is asking. HR (recruitment.manage)
// does everything; whoever drafted it may change, submit and withdraw it until it is approved.

export interface OpeningState {
  status: OpeningStatus;
  closesOn: string | null;
  /** Applications hired into it. */
  hired: number;
}

export interface OpeningActor {
  manage: boolean;
  /** The login that drafted it. */
  creator: boolean;
}

const BEFORE_APPROVAL: readonly OpeningStatus[] = ['draft', 'pending_approval', 'rejected'];
const EDITABLE: readonly OpeningStatus[] = ['draft', 'rejected'];
const FINISHED: readonly OpeningStatus[] = ['filled', 'cancelled'];

/** Why the actor may not take the action now, or null when they may. */
export function refusal(
  action: OpeningAction,
  o: OpeningState,
  who: OpeningActor,
  today: string,
): HttpException | null {
  const drafter = who.manage || who.creator;
  switch (action) {
    case 'edit':
    case 'submit':
      if (!drafter) return roleRefused();
      return EDITABLE.includes(o.status) ? null : notDraft();
    case 'cancel':
      if (FINISHED.includes(o.status)) return finished();
      if (!who.manage && !(who.creator && BEFORE_APPROVAL.includes(o.status))) {
        return roleRefused();
      }
      return o.hired > 0
        ? conflict('opening_has_hire', 'Someone was hired into this opening; close it instead')
        : null;
  }
  if (!who.manage) return roleRefused();
  if (FINISHED.includes(o.status)) return finished();
  if (BEFORE_APPROVAL.includes(o.status)) {
    return conflict('opening_not_approved', 'This opening must be approved first');
  }
  switch (action) {
    case 'post':
      return null;
    case 'publish':
      return o.status === 'approved'
        ? null
        : conflict('opening_published', 'This opening was already published');
    case 'close':
      return o.status === 'open'
        ? null
        : conflict('opening_not_open', 'Only an open opening can be closed');
    case 'reopen':
      if (o.status !== 'closed') {
        return conflict('opening_not_closed', 'Only a closed opening can be reopened');
      }
      return o.closesOn && o.closesOn >= today ? null : closesOnPast();
  }
}

/** Every action the actor may take now, for the web to offer. */
export const openingActions = (
  o: OpeningState,
  who: OpeningActor,
  today: string,
): OpeningAction[] =>
  (['edit', 'submit', 'post', 'publish', 'close', 'reopen', 'cancel'] as const).filter(
    (a) => refusal(a, o, who, today) === null,
  );

const roleRefused = () => forbidden('role_not_allowed', 'Your role cannot do this');
const notDraft = () =>
  conflict('opening_not_draft', 'Only a draft or a rejected opening can be changed and submitted');
const finished = () => conflict('opening_finished', 'This opening is filled or cancelled');
export const closesOnPast = () =>
  conflict('closes_on_past', 'The closing date has passed; choose a later one first');
