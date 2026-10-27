import { plainText } from './markdown';

// Search over the help centre in one language. Words are split on spaces and punctuation
// (the Bangla danda too) and case-folded; a query word matches a word it begins, so "বেতন"
// finds "বেতনের" and "payslip" finds "payslips". Every query word must match somewhere.

/** Lowercase words of any script: letters with their marks (Bangla vowel signs), digits. */
export function tokenize(text: string): string[] {
  return (
    text
      .normalize('NFC')
      .toLowerCase()
      // Joiners shape Bangla conjuncts; they are not word breaks.
      .replace(/[‌‍]/g, '')
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .filter(Boolean)
  );
}

/** A title match counts most, then the summary, then the body. */
const WEIGHTS = { title: 5, summary: 2, body: 1 } as const;
/** Repeats in the body stop counting after this many. */
const BODY_REPEATS = 3;

export interface Searchable {
  slug: string;
  title: string;
  summary: string;
  body: string;
}

interface Indexed<T> {
  item: T;
  title: string[];
  summary: string[];
  body: string[];
}

const index = new WeakMap<object, Indexed<Searchable>>();

function indexed<T extends Searchable>(item: T): Indexed<T> {
  let entry = index.get(item);
  if (!entry) {
    entry = {
      item,
      title: tokenize(item.title),
      summary: tokenize(item.summary),
      body: tokenize(plainText(item.body)),
    };
    index.set(item, entry);
  }
  return entry as Indexed<T>;
}

const matches = (words: string[], q: string) =>
  words.filter((w) => (q.length > 1 ? w.startsWith(q) : w === q)).length;

/** The items matching every word of the query, best first. */
export function searchArticles<T extends Searchable>(items: T[], query: string): T[] {
  const words = [...new Set(tokenize(query.slice(0, 200)))];
  if (!words.length) return [];
  return items
    .map((item) => {
      const entry = indexed(item);
      let score = 0;
      for (const q of words) {
        const found =
          WEIGHTS.title * Math.min(matches(entry.title, q), 1) +
          WEIGHTS.summary * Math.min(matches(entry.summary, q), 1) +
          WEIGHTS.body * Math.min(matches(entry.body, q), BODY_REPEATS);
        if (!found) return null;
        score += found;
      }
      return { item, score };
    })
    .filter((r): r is { item: T; score: number } => r !== null)
    .toSorted((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .map((r) => r.item);
}
