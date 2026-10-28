import type { EmailMessage } from '../notifications/senders.js';

const bnNumber = (n: number) => new Intl.NumberFormat('bn-BD').format(n);

export interface ApplicationReceipt {
  to: string;
  language: 'en' | 'bn';
  /** The job's title in the candidate's language, or the other when that is all there is. */
  jobTitle: string;
  company: string;
  retentionMonths: number;
  /** Kept for other jobs until they withdraw consent. */
  talentPool: boolean;
  privacyEmail: string | null;
}

/**
 * The candidate's confirmation, in the language they applied in: what they applied for, how
 * long it is kept and whom to ask, as the Personal Data Protection Ordinance 2025 asks.
 * Nothing the form typed goes in it but the address it is sent to: anyone can apply with
 * anyone's address, and a typed name could carry a link in the company's name.
 */
export function applicationReceipt(r: ApplicationReceipt): EmailMessage {
  if (r.language === 'bn') {
    const kept = r.talentPool
      ? 'আপনি আমাদের ট্যালেন্ট পুলে থাকতে সম্মতি দিয়েছেন, তাই আপনি সম্মতি প্রত্যাহার না করা পর্যন্ত আপনার আবেদন ও সিভি আমরা রাখব।'
      : `আপনার শেষ আবেদনের নিষ্পত্তির পর ${bnNumber(r.retentionMonths)} মাস আমরা আপনার আবেদন ও সিভি রাখব, তারপর মুছে ফেলব।`;
    const contact = r.privacyEmail
      ? `আপনার তথ্য দেখতে, সংশোধন বা মুছে ফেলতে, অথবা সম্মতি প্রত্যাহার করতে লিখুন: ${r.privacyEmail}`
      : `আপনার তথ্য দেখতে, সংশোধন বা মুছে ফেলতে, অথবা সম্মতি প্রত্যাহার করতে ${r.company}-এর সঙ্গে যোগাযোগ করুন।`;
    return {
      to: r.to,
      subject: `${r.company}-এ ${r.jobTitle} পদে আপনার আবেদন`,
      text: [
        'প্রিয় আবেদনকারী,',
        '',
        `${r.company}-এ ${r.jobTitle} পদে আবেদন করার জন্য ধন্যবাদ। আপনার আবেদন ও সিভি আমরা পেয়েছি।`,
        '',
        kept,
        contact,
      ].join('\n'),
    };
  }
  const kept = r.talentPool
    ? 'You agreed to stay in our talent pool, so we keep your application and CV until you withdraw your consent.'
    : `We keep your application and CV for ${r.retentionMonths} month${r.retentionMonths === 1 ? '' : 's'} after your last application with us closes, and then erase them.`;
  const contact = r.privacyEmail
    ? `To see, correct or erase your data, or to withdraw your consent, write to ${r.privacyEmail}.`
    : `To see, correct or erase your data, or to withdraw your consent, contact ${r.company}.`;
  return {
    to: r.to,
    subject: `Your application for ${r.jobTitle} at ${r.company}`,
    text: [
      'Dear applicant,',
      '',
      `Thank you for applying for ${r.jobTitle} at ${r.company}. We have received your application and CV.`,
      '',
      kept,
      contact,
    ].join('\n'),
  };
}
