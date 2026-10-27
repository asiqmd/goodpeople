import 'server-only';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_DOCUMENTS, type LegalDocument } from '@gp/shared';

// Help articles and legal documents are Markdown files in the web app's content/ directory,
// one per language with the same name, so they are reviewed and shipped like code.

export const CONTENT_LOCALES = ['en', 'bn'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/** The help centre's sections, in the order the help page lists them. */
export const HELP_CATEGORIES = ['start', 'time', 'payroll', 'billing', 'packs', 'support'] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  category: HelpCategory;
  /** The day the article was last checked against the product (YYYY-MM-DD). */
  updated: string;
  /** Pages in the app the article is about. */
  related: string[];
  /** Its place within the category; lower comes first. */
  order: number;
  body: string;
}

export interface LegalText {
  doc: LegalDocument;
  title: string;
  summary: string;
  updated: string;
  /** The TERMS_VERSION this text belongs to. */
  version: string;
  body: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The content directory beside src/. Next.js compiles this module into .next, and Turbopack
 * rebuilds import.meta.url from where .next sits, which matches the source tree when the app
 * runs from its checkout (development, `next start`, tests). The Docker image keeps only the
 * app's own files and runs from that directory, so content/ is found there instead.
 */
function contentRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../../../content'), path.join(process.cwd(), 'content')];
  const found = candidates.find((dir) => existsSync(path.join(dir, 'help')));
  if (!found) throw new Error(`Help content not found in ${candidates.join(' or ')}`);
  return found;
}

/** Front matter (`key: value` lines between `---`) and the Markdown after it. */
export function parseFrontMatter(raw: string, file: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`${file}: no front matter`);
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const pair = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`${file}: "${line}" is not a key: value line`);
    meta[pair[1]!] = pair[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { meta, body: match[2]!.trim() };
}

function required(meta: Record<string, string>, key: string, file: string): string {
  const value = meta[key];
  if (!value) throw new Error(`${file}: "${key}" is missing`);
  return value;
}

function date(meta: Record<string, string>, key: string, file: string): string {
  const value = required(meta, key, file);
  if (!DATE.test(value)) throw new Error(`${file}: "${key}" must be YYYY-MM-DD`);
  return value;
}

function readHelp(dir: string): HelpArticle[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = path.join(dir, name);
      const slug = name.slice(0, -3);
      if (!SLUG.test(slug)) throw new Error(`${file}: names are lowercase words with dashes`);
      const { meta, body } = parseFrontMatter(readFileSync(file, 'utf8'), file);
      const category = required(meta, 'category', file) as HelpCategory;
      if (!HELP_CATEGORIES.includes(category)) {
        throw new Error(`${file}: category must be one of ${HELP_CATEGORIES.join(', ')}`);
      }
      const related = (meta.related ?? '').split(/[\s,]+/).filter(Boolean);
      const unsafe = related.find((p) => !/^\/(?![/\\])\S*$/.test(p));
      if (unsafe) throw new Error(`${file}: related "${unsafe}" is not an app path`);
      return {
        slug,
        title: required(meta, 'title', file),
        summary: required(meta, 'summary', file),
        category,
        updated: date(meta, 'updated', file),
        related,
        order: meta.order ? Number(meta.order) : 100,
        body,
      };
    })
    .toSorted(
      (a, b) =>
        HELP_CATEGORIES.indexOf(a.category) - HELP_CATEGORIES.indexOf(b.category) ||
        a.order - b.order ||
        a.title.localeCompare(b.title),
    );
}

function readLegal(dir: string): LegalText[] {
  return LEGAL_DOCUMENTS.flatMap((doc) => {
    const file = path.join(dir, `${doc}.md`);
    if (!existsSync(file)) return [];
    const { meta, body } = parseFrontMatter(readFileSync(file, 'utf8'), file);
    return [
      {
        doc,
        title: required(meta, 'title', file),
        summary: required(meta, 'summary', file),
        updated: date(meta, 'updated', file),
        version: date(meta, 'version', file),
        body,
      },
    ];
  });
}

interface Library {
  help: HelpArticle[];
  legal: LegalText[];
}

const cache = new Map<ContentLocale, Library>();

/** Everything in one language, read once per server (on every request in development). */
export function contentFor(locale: ContentLocale): Library {
  const cached = process.env.NODE_ENV === 'development' ? undefined : cache.get(locale);
  if (cached) return cached;
  const root = contentRoot();
  const library = {
    help: readHelp(path.join(root, 'help', locale)),
    legal: readLegal(path.join(root, 'legal', locale)),
  };
  cache.set(locale, library);
  return library;
}

export const contentLocale = (locale: string): ContentLocale => (locale === 'bn' ? 'bn' : 'en');

export const helpArticles = (locale: string) => contentFor(contentLocale(locale)).help;

export const helpArticle = (locale: string, slug: string) =>
  helpArticles(locale).find((a) => a.slug === slug) ?? null;

export const legalText = (locale: string, doc: string) =>
  contentFor(contentLocale(locale)).legal.find((d) => d.doc === doc) ?? null;
