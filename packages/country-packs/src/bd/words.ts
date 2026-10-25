// Amounts in words for payslips and vouchers, counted the Bangladeshi way: hundreds,
// thousands, lakhs (100,000) and crores (10,000,000).

const EN_ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/** 0–99 in Bangla: each number has its own word. */
const BN_0_99 = [
  'শূন্য',
  'এক',
  'দুই',
  'তিন',
  'চার',
  'পাঁচ',
  'ছয়',
  'সাত',
  'আট',
  'নয়',
  'দশ',
  'এগারো',
  'বারো',
  'তেরো',
  'চৌদ্দ',
  'পনেরো',
  'ষোলো',
  'সতেরো',
  'আঠারো',
  'উনিশ',
  'বিশ',
  'একুশ',
  'বাইশ',
  'তেইশ',
  'চব্বিশ',
  'পঁচিশ',
  'ছাব্বিশ',
  'সাতাশ',
  'আটাশ',
  'উনত্রিশ',
  'ত্রিশ',
  'একত্রিশ',
  'বত্রিশ',
  'তেত্রিশ',
  'চৌত্রিশ',
  'পঁয়ত্রিশ',
  'ছত্রিশ',
  'সাঁইত্রিশ',
  'আটত্রিশ',
  'উনচল্লিশ',
  'চল্লিশ',
  'একচল্লিশ',
  'বিয়াল্লিশ',
  'তেতাল্লিশ',
  'চুয়াল্লিশ',
  'পঁয়তাল্লিশ',
  'ছেচল্লিশ',
  'সাতচল্লিশ',
  'আটচল্লিশ',
  'উনপঞ্চাশ',
  'পঞ্চাশ',
  'একান্ন',
  'বাহান্ন',
  'তিপ্পান্ন',
  'চুয়ান্ন',
  'পঞ্চান্ন',
  'ছাপ্পান্ন',
  'সাতান্ন',
  'আটান্ন',
  'উনষাট',
  'ষাট',
  'একষট্টি',
  'বাষট্টি',
  'তেষট্টি',
  'চৌষট্টি',
  'পঁয়ষট্টি',
  'ছেষট্টি',
  'সাতষট্টি',
  'আটষট্টি',
  'উনসত্তর',
  'সত্তর',
  'একাত্তর',
  'বাহাত্তর',
  'তিয়াত্তর',
  'চুয়াত্তর',
  'পঁচাত্তর',
  'ছিয়াত্তর',
  'সাতাত্তর',
  'আটাত্তর',
  'উনআশি',
  'আশি',
  'একাশি',
  'বিরাশি',
  'তিরাশি',
  'চুরাশি',
  'পঁচাশি',
  'ছিয়াশি',
  'সাতাশি',
  'আটাশি',
  'উননব্বই',
  'নব্বই',
  'একানব্বই',
  'বিরানব্বই',
  'তিরানব্বই',
  'চুরানব্বই',
  'পঁচানব্বই',
  'ছিয়ানব্বই',
  'সাতানব্বই',
  'আটানব্বই',
  'নিরানব্বই',
];

const enUnder100 = (n: number) =>
  n < 20 ? EN_ONES[n]! : `${EN_TENS[Math.floor(n / 10)]}${n % 10 ? `-${EN_ONES[n % 10]}` : ''}`;

/** Splits a whole number into crores, lakhs, thousands, hundreds and the rest. */
function parts(n: number) {
  return {
    crore: Math.floor(n / 10_000_000),
    lakh: Math.floor((n % 10_000_000) / 100_000),
    thousand: Math.floor((n % 100_000) / 1_000),
    hundred: Math.floor((n % 1_000) / 100),
    rest: n % 100,
  };
}

function enWords(n: number): string {
  if (n === 0) return 'zero';
  const p = parts(n);
  const words: string[] = [];
  // Above 99 crore the crores are themselves counted in lakhs and thousands.
  if (p.crore) words.push(`${enWords(p.crore)} crore`);
  if (p.lakh) words.push(`${enUnder100(p.lakh)} lakh`);
  if (p.thousand) words.push(`${enUnder100(p.thousand)} thousand`);
  if (p.hundred) words.push(`${EN_ONES[p.hundred]} hundred`);
  if (p.rest) words.push(`${words.length ? 'and ' : ''}${enUnder100(p.rest)}`);
  return words.join(' ');
}

function bnWords(n: number): string {
  if (n === 0) return BN_0_99[0]!;
  const p = parts(n);
  const words: string[] = [];
  if (p.crore) words.push(`${bnWords(p.crore)} কোটি`);
  if (p.lakh) words.push(`${BN_0_99[p.lakh]} লক্ষ`);
  if (p.thousand) words.push(`${BN_0_99[p.thousand]} হাজার`);
  if (p.hundred) words.push(`${BN_0_99[p.hundred]} শত`);
  if (p.rest) words.push(BN_0_99[p.rest]!);
  return words.join(' ');
}

/**
 * An amount of taka in words, e.g. 12500.50 → "Taka twelve thousand five hundred and fifty
 * paisa only" / "বারো হাজার পাঁচ শত টাকা পঞ্চাশ পয়সা মাত্র". Negative amounts are refused.
 */
export function takaInWords(amount: string | number, language: 'en' | 'bn'): string {
  const [whole = '0', fraction = ''] = String(amount).split('.');
  const taka = Number(whole);
  const paisa = Number(fraction.padEnd(2, '0').slice(0, 2));
  if (!Number.isSafeInteger(taka) || taka < 0) throw new Error(`Cannot write ${amount} in words`);
  if (language === 'en') {
    const text = `Taka ${enWords(taka)}${paisa ? ` and ${enUnder100(paisa)} paisa` : ''} only`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `${bnWords(taka)} টাকা${paisa ? ` ${BN_0_99[paisa]} পয়সা` : ''} মাত্র`;
}
