import { Fragment, type ReactNode } from 'react';

// The help centre's and legal pages' Markdown: a small, safe subset. Text only ever becomes
// React text (escaped by React); no HTML is passed through, and a link is a link only when
// it goes to a path in this app or to an https:// address. Anything else stays plain text.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; text: string };

export type Block =
  | { kind: 'heading'; level: 2 | 3; id: string; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'note'; paragraphs: Inline[][] };

/** A link's target when it is safe to follow: an app path (not `//host`) or https://. */
export function safeHref(href: string): string | null {
  // Control characters and spaces are dropped or misread by browsers' URL parsers.
  if (/[\s\p{Cc}]/u.test(href)) return null;
  // `//host` and `/\host` are other sites without a scheme.
  if (/^\/(?![/\\])/.test(href)) return href;
  if (/^https:\/\/[^/\\?#@]+(?:[/?#]|$)/i.test(href)) return href;
  return null;
}

const ESCAPABLE = '\\`*_{}[]()#+-.!>|~<';
const INLINE = /\\(.)|\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]*)\)/gu;

/** Bold, code and links within a line; everything else is text. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const text = (value: string) => {
    if (!value) return;
    const last = out.at(-1);
    if (last?.kind === 'text') last.text += value;
    else out.push({ kind: 'text', text: value });
  };
  let at = 0;
  for (const match of source.matchAll(INLINE)) {
    text(source.slice(at, match.index));
    at = match.index + match[0].length;
    const [whole, escaped, strong, code, label, href] = match;
    if (escaped !== undefined) text(ESCAPABLE.includes(escaped) ? escaped : whole);
    else if (strong !== undefined) out.push({ kind: 'strong', children: parseInline(strong) });
    else if (code !== undefined) out.push({ kind: 'code', text: code });
    else {
      const safe = safeHref(href ?? '');
      if (safe) out.push({ kind: 'link', href: safe, text: unescape(label!) });
      else text(unescape(label!));
    }
  }
  text(source.slice(at));
  return out;
}

const unescape = (value: string) =>
  value.replace(/\\(.)/gu, (whole, c: string) => (ESCAPABLE.includes(c) ? c : whole));

/** The words of some inline content, for anchors and search. */
export function inlineText(content: Inline[]): string {
  return content.map((i) => (i.kind === 'strong' ? inlineText(i.children) : i.text)).join('');
}

/** A heading's anchor: lowercase letters (Bangla too) and digits joined by dashes. */
export function headingId(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‌‍]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

const HEADING = /^(#{2,3})\s+(.+?)\s*#*\s*$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.*)$/;
const NOTE = /^>\s?(.*)$/;

/** Splits a document into headings, paragraphs, lists and notes. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const ids = new Set<string>();
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let note: string[][] | null = null;

  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    if (list) {
      const { ordered, items } = list;
      blocks.push({ kind: 'list', ordered, items: items.map(parseInline) });
    }
    if (note) {
      const paragraphs = note.filter((p) => p.length).map((p) => parseInline(p.join(' ')));
      if (paragraphs.length) blocks.push({ kind: 'note', paragraphs });
    }
    paragraph = [];
    list = null;
    note = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const quoted = NOTE.exec(trimmed);
    if (quoted) {
      if (!note) flush();
      note ??= [[]];
      const inner = quoted[1]!.trim();
      if (inner) note.at(-1)!.push(inner);
      else note.push([]);
      continue;
    }
    if (note) flush();
    const heading = HEADING.exec(trimmed);
    if (heading && !/^\s/.test(line)) {
      flush();
      const content = parseInline(heading[2]!);
      const base = headingId(inlineText(content)) || 'section';
      let id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
      ids.add(id);
      blocks.push({ kind: 'heading', level: heading[1]!.length as 2 | 3, id, content });
      continue;
    }
    const bullet = BULLET.exec(trimmed);
    const numbered = bullet ? null : NUMBERED.exec(trimmed);
    if ((bullet || numbered) && !/^\s{2,}/.test(line)) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    // An indented line carries on the list item above it.
    if (list && /^\s+/.test(line)) {
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }
    if (list) flush();
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

/** A document's words without its markup, for search. */
export function plainText(source: string): string {
  return parseMarkdown(source)
    .map((b) => {
      if (b.kind === 'list') return b.items.map(inlineText).join('\n');
      if (b.kind === 'note') return b.paragraphs.map(inlineText).join('\n');
      return inlineText(b.content);
    })
    .join('\n');
}

function InlineContent({ content }: { content: Inline[] }) {
  return content.map((part, i) => {
    switch (part.kind) {
      case 'text':
        return <Fragment key={i}>{part.text}</Fragment>;
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-slate-900">
            <InlineContent content={part.children} />
          </strong>
        );
      case 'code':
        return (
          <code key={i} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-slate-800">
            {part.text}
          </code>
        );
      case 'link':
        return part.href.startsWith('/') ? (
          <a key={i} href={part.href} className="font-medium text-brand-700 hover:underline">
            {part.text}
          </a>
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            {part.text}
          </a>
        );
    }
  });
}

/** Renders a document of the safe subset as React elements. */
export function Markdown({ source }: { source: string }): ReactNode {
  return (
    <div className="space-y-4 text-[15px] leading-7 text-slate-700">
      {parseMarkdown(source).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = block.level === 2 ? 'h2' : 'h3';
            return (
              <Tag
                key={i}
                id={block.id}
                className={`scroll-mt-6 font-semibold text-slate-900 ${
                  block.level === 2 ? 'pt-4 text-xl' : 'pt-2 text-base'
                }`}
              >
                <a href={`#${block.id}`} className="hover:underline">
                  <InlineContent content={block.content} />
                </a>
              </Tag>
            );
          }
          case 'paragraph':
            return (
              <p key={i}>
                <InlineContent content={block.content} />
              </p>
            );
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={i}
                // Bangla pages number their steps in Bangla digits.
                className={`space-y-1 pl-6 ${
                  block.ordered
                    ? 'list-decimal [&:lang(bn)]:[list-style-type:bengali]'
                    : 'list-disc'
                }`}
              >
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineContent content={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case 'note':
            return (
              <aside
                key={i}
                className="space-y-2 rounded-lg bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-inset ring-sky-600/20"
              >
                {block.paragraphs.map((p, j) => (
                  <p key={j}>
                    <InlineContent content={p} />
                  </p>
                ))}
              </aside>
            );
        }
      })}
    </div>
  );
}
