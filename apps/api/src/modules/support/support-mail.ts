import { TICKET_AUTO_CLOSE_DAYS, ticketLabel, type UserLanguage } from '@gp/shared';
import type { EmailMessage } from '../notifications/senders.js';

/** What the emails say about a ticket. */
export interface MailTicket {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: 'normal' | 'urgent';
  firstResponseDueAt: Date;
  firstRespondedAt: Date | null;
  openedByName: string;
  openedByEmail: string | null;
  tenant: { name: string; slug: string; plan: string };
}

const dhakaTime = (date: Date, language: UserLanguage) =>
  new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(date);

/**
 * To Good People's support inbox: a new ticket, or the customer's reply on one. Only what is
 * needed to pick it up; the message itself stays in the console.
 */
export function inboxMail(
  to: string,
  ticket: MailTicket,
  event: { kind: 'opened' } | { kind: 'replied'; by: string },
  consoleLink: string,
): EmailMessage {
  const label = ticketLabel(ticket.number);
  const urgent = ticket.priority === 'urgent';
  const due = `${dhakaTime(ticket.firstResponseDueAt, 'en')} Dhaka time${
    ticket.firstRespondedAt ? ' (answered)' : ''
  }`;
  const headline =
    event.kind === 'opened'
      ? `${ticket.tenant.name} opened ${label}.`
      : `${event.by} from ${ticket.tenant.name} replied on ${label}.`;
  return {
    to,
    subject: `[${label}]${urgent ? ' URGENT' : ''} ${
      event.kind === 'opened' ? 'New ticket' : 'Customer replied'
    }: ${ticket.subject}`,
    text: [
      headline,
      '',
      `Workspace: ${ticket.tenant.name} (${ticket.tenant.slug}), ${ticket.tenant.plan} plan`,
      `Subject: ${ticket.subject}`,
      `Category: ${ticket.category}`,
      `Priority: ${urgent ? 'Urgent' : 'Normal'}`,
      `Opened by: ${ticket.openedByName}${ticket.openedByEmail ? ` <${ticket.openedByEmail}>` : ''}`,
      `First response due: ${due}`,
      '',
      `Open it in the console: ${consoleLink}`,
    ].join('\n'),
  };
}

/** To the person who opened the ticket: support's public reply, in their language. */
export function replyMail(
  to: string,
  language: UserLanguage,
  ticket: MailTicket,
  reply: { authorName: string; body: string; resolved: boolean },
  link: string,
): EmailMessage {
  const label = ticketLabel(ticket.number);
  if (language === 'bn') {
    const days = new Intl.NumberFormat('bn-BD').format(TICKET_AUTO_CLOSE_DAYS);
    return {
      to,
      subject: `[${label}] গুড পিপল সহায়তা দলের উত্তর: ${ticket.subject}`,
      text: [
        `প্রিয় ${ticket.openedByName},`,
        '',
        `গুড পিপল সহায়তা দলের ${reply.authorName} আপনার টিকিট ${label} ("${ticket.subject}")-এর উত্তর দিয়েছেন:`,
        '',
        reply.body,
        '',
        ...(reply.resolved
          ? [
              `আমাদের ধারণা, সমস্যাটির সমাধান হয়েছে। না হয়ে থাকলে উত্তর দিন, টিকিটটি আবার খুলে যাবে; নইলে ${days} দিন পর এটি নিজে থেকেই বন্ধ হয়ে যাবে।`,
              '',
            ]
          : []),
        `উত্তর পড়তে বা জবাব দিতে এখানে যান: ${link}`,
      ].join('\n'),
    };
  }
  return {
    to,
    subject: `[${label}] Good People support replied: ${ticket.subject}`,
    text: [
      `Hello ${ticket.openedByName},`,
      '',
      `${reply.authorName} from Good People support replied to your ticket ${label} ("${ticket.subject}"):`,
      '',
      reply.body,
      '',
      ...(reply.resolved
        ? [
            `We think this is solved. If it is not, reply and the ticket opens again; otherwise it closes by itself in ${TICKET_AUTO_CLOSE_DAYS} days.`,
            '',
          ]
        : []),
      `Read it and reply here: ${link}`,
    ].join('\n'),
  };
}
