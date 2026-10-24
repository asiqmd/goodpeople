/** A calendar date, YYYY-MM-DD. */
export type IsoDate = string;

export interface LegalReference {
  act: string;
  section: string;
  url?: string;
}

/**
 * `verified`: checked against the gazetted text. `needs_review`: taken from secondary sources
 * that may conflict; a labour lawyer or tax consultant must confirm before release.
 */
export type ReviewStatus = 'verified' | 'needs_review';

export interface RuleVersion<V> {
  /** First day this version is in force. */
  from: IsoDate;
  value: V;
  reference: LegalReference;
  status: ReviewStatus;
  note?: string;
}

export interface RuleDefinition<V> {
  title: string;
  /** Oldest first. */
  versions: readonly RuleVersion<V>[];
}

/** A country's rules, keyed by rule name, each typed by its value. */
export type Rulebook<M> = { readonly [K in keyof M]: RuleDefinition<M[K]> };

export interface ResolvedRule<V> extends RuleVersion<V> {
  key: string;
  title: string;
  /** Last day in force, or null while current. */
  to: IsoDate | null;
}

function dayBefore(date: IsoDate): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The version of a rule in force on a date. Throws for a date before the rule existed. */
export function ruleOn<M, K extends keyof M & string>(
  book: Rulebook<M>,
  key: K,
  date: IsoDate,
): ResolvedRule<M[K]> {
  const { title, versions } = book[key];
  const index = versions.findLastIndex((v) => v.from <= date);
  const version = versions[index];
  if (!version) throw new Error(`Rule ${key} has no version in force on ${date}`);
  const next = versions[index + 1];
  return { ...version, key, title, to: next ? dayBefore(next.from) : null };
}

/** Every version of every rule, for showing the rulebook with its history. */
export function allRules<M>(book: Rulebook<M>): ResolvedRule<unknown>[] {
  return (Object.keys(book) as (keyof M & string)[]).flatMap((key) =>
    book[key].versions.map((v, i, all) => ({
      ...v,
      key,
      title: book[key].title,
      to: all[i + 1] ? dayBefore(all[i + 1]!.from) : null,
    })),
  );
}
