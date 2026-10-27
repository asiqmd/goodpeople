import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_DOCUMENTS, TERMS_VERSION } from '@gp/shared';
import { describe, expect, it, vi } from 'vitest';
import { safeHref } from './markdown';

vi.mock('server-only', () => ({}));
const { contentFor, CONTENT_LOCALES, HELP_CATEGORIES } = await import('./content');

const [en, bn] = CONTENT_LOCALES.map((locale) => contentFor(locale));
const helpSlugs = new Set(en!.help.map((a) => a.slug));
const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;

describe('help and legal content', () => {
  it('has every help article in both languages, filed the same way', () => {
    expect(en!.help.length).toBeGreaterThanOrEqual(12);
    const shape = (lib: typeof en) =>
      lib!.help.map(({ slug, category, order, related }) => ({ slug, category, order, related }));
    expect(shape(bn)).toEqual(shape(en));
    for (const category of HELP_CATEGORIES) {
      expect(
        en!.help.some((a) => a.category === category),
        category,
      ).toBe(true);
    }
  });

  it('has the four legal documents in both languages, at the current terms version', () => {
    for (const lib of [en, bn]) {
      expect(lib!.legal.map((d) => d.doc)).toEqual([...LEGAL_DOCUMENTS]);
      for (const doc of lib!.legal) expect(doc.version, doc.doc).toBe(TERMS_VERSION);
    }
  });

  it('links only to safe targets and to articles that exist', () => {
    const docs = [en, bn].flatMap((lib) => [
      ...lib!.help.map((a) => ({ name: `help/${a.slug}`, body: a.body })),
      ...lib!.legal.map((d) => ({ name: `legal/${d.doc}`, body: d.body })),
    ]);
    for (const { name, body } of docs) {
      for (const [, , href] of body.matchAll(LINK)) {
        expect(safeHref(href!), `${name}: ${href}`).not.toBeNull();
        const article = /^\/help\/([^/?#]+)/.exec(href!)?.[1];
        if (article) expect(helpSlugs.has(article), `${name}: ${href}`).toBe(true);
        const legal = /^\/legal\/([^/?#]+)/.exec(href!)?.[1];
        if (legal) expect(LEGAL_DOCUMENTS, `${name}: ${href}`).toContain(legal);
      }
    }
  });

  it('has an article for every HelpLink in the app', () => {
    const src = fileURLToPath(new URL('../..', import.meta.url));
    const used = new Set<string>();
    for (const file of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
      if (!file.endsWith('.tsx')) continue;
      const text = readFileSync(path.join(src, file), 'utf8');
      for (const [, slug] of text.matchAll(/<HelpLink\s+slug="([^"]+)"/g)) used.add(slug!);
    }
    expect(used.size).toBeGreaterThanOrEqual(10);
    for (const slug of used) expect(helpSlugs.has(slug), slug).toBe(true);
  });
});
