import type { EmployeeRef, } from '@gp/shared';
import { localDate, type Localized } from '../notifications/notifications.service.js';

// What `performance.task` says for each review step, in English and Bangla. The template adds
// "Please finish it by {{task.due}}" after the detail.

type Text = { en: string; bn: string; ar?: string };

const bnNumber = (n: number) => new Intl.NumberFormat('bn-BD').format(n);
const nameOf = (p: Pick<EmployeeRef, 'fullName' | 'fullNameBn'>): Text => ({
  en: p.fullName,
  bn: p.fullNameBn ?? p.fullName,
});

const task = (title: Text, detail: Text, due: string): Record<string, Localized> => ({
  'task.title': title,
  'task.detail': detail,
  'task.due': localDate(due),
});

export const selfReviewTask = (cycle: string, due: string) =>
  task(
    { en: 'Your self review', bn: 'আপনার আত্মমূল্যায়ন' },
    {
      en: `Your self review for ${cycle} is open: rate your goals and the competencies, and add your comments.`,
      bn: `${cycle}-এর আপনার আত্মমূল্যায়ন শুরু হয়েছে: আপনার লক্ষ্য ও দক্ষতাগুলোর রেটিং দিন এবং মন্তব্য লিখুন।`,
    },
    due,
  );

/** One review waits for the manager, after the person's self review or added later. */
export const managerReviewTask = (cycle: string, person: EmployeeRef, due: string) => {
  const name = nameOf(person);
  return task(
    { en: `Review ${name.en}`, bn: `${name.bn}-এর মূল্যায়ন` },
    {
      en: `${name.en}'s review for ${cycle} is waiting for you.`,
      bn: `${cycle}-এ ${name.bn}-এর মূল্যায়ন আপনার জন্য অপেক্ষা করছে।`,
    },
    due,
  );
};

/** The team's reviews waiting for a manager, in one message. */
export const teamReviewsDetail = (cycle: string, count: number): Text =>
  count === 1
    ? {
        en: `One review for ${cycle} is waiting for you.`,
        bn: `${cycle}-এর একটি মূল্যায়ন আপনার জন্য অপেক্ষা করছে।`,
      }
    : {
        en: `${count} reviews for ${cycle} are waiting for you.`,
        bn: `${cycle}-এর ${bnNumber(count)}টি মূল্যায়ন আপনার জন্য অপেক্ষা করছে।`,
      };

export const teamReviewsTitle: Text = { en: "Your team's reviews", bn: 'আপনার দলের মূল্যায়ন' };

export const peerApprovalTask = (cycle: string, person: EmployeeRef, due: string) => {
  const name = nameOf(person);
  return task(
    { en: `Approve peers for ${name.en}`, bn: `${name.bn}-এর জন্য সহকর্মী অনুমোদন` },
    {
      en: `Peers have been named to give feedback on ${name.en} for ${cycle}. Approve or decline each.`,
      bn: `${cycle}-এ ${name.bn} সম্পর্কে মতামত দিতে সহকর্মীদের নাম দেওয়া হয়েছে। প্রত্যেককে অনুমোদন বা বাতিল করুন।`,
    },
    due,
  );
};

export const peerAnswerTask = (cycle: string, person: EmployeeRef, due: string) => {
  const name = nameOf(person);
  return task(
    { en: `Feedback on ${name.en}`, bn: `${name.bn} সম্পর্কে মতামত` },
    {
      en: `You have been asked for feedback on ${name.en} for ${cycle}. They never see who wrote what.`,
      bn: `${cycle}-এ ${name.bn} সম্পর্কে আপনার মতামত চাওয়া হয়েছে। কে কী লিখেছেন, তিনি কখনো জানবেন না।`,
    },
    due,
  );
};

export const peerReminderTask = (cycle: string, due: string) =>
  task(
    { en: 'Peer feedback', bn: 'সহকর্মীর মতামত' },
    {
      en: `Your feedback on colleagues for ${cycle} is still to come.`,
      bn: `${cycle}-এ সহকর্মীদের সম্পর্কে আপনার মতামত এখনো বাকি।`,
    },
    due,
  );

export const releasedToManagerTask = (cycle: string, due: string) =>
  task(
    { en: `Reviews released: ${cycle}`, bn: `মূল্যায়ন প্রকাশিত: ${cycle}` },
    {
      en: `Your team's reviews for ${cycle} are released. Go through each with the person, who acknowledges it with their comments.`,
      bn: `${cycle}-এ আপনার দলের মূল্যায়ন প্রকাশিত হয়েছে। প্রত্যেকের সঙ্গে তাঁর মূল্যায়ন নিয়ে কথা বলুন; তিনি নিজের মন্তব্যসহ তা স্বীকার করবেন।`,
    },
    due,
  );
