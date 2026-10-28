import { headers } from 'next/headers';
import { inlineText, parseMarkdown } from '@/lib/help/markdown';

/** A job description as plain text, for job boards that keep no formatting. */
export function plainDescription(markdown: string): string {
  return parseMarkdown(markdown)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
        case 'paragraph':
          return inlineText(block.content);
        case 'note':
          return block.paragraphs.map(inlineText).join('\n');
        case 'list':
          return block.items
            .map((item, i) => `${block.ordered ? `${i + 1}.` : '•'} ${inlineText(item)}`)
            .join('\n');
      }
    })
    .join('\n\n');
}

/** This site's address as the visitor reached it, for links people copy elsewhere. */
export async function siteOrigin() {
  const h = await headers();
  const first = (name: string) => h.get(name)?.split(',')[0]?.trim();
  const host = first('x-forwarded-host') ?? first('host') ?? 'localhost:3000';
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  return `${first('x-forwarded-proto') ?? (local ? 'http' : 'https')}://${host}`;
}
