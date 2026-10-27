import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, parseInline, parseMarkdown, plainText, safeHref } from './markdown';

const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }));

describe('the help Markdown renderer', () => {
  it('escapes HTML instead of passing it through', () => {
    const out = html(
      '<script>alert(1)</script>\n\n**<img src=x onerror=alert(1)>** and `<b>`\n\n> <iframe>',
    );
    expect(out).not.toMatch(/<(script|img|iframe|b)[\s>]/);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('<strong class="font-semibold text-slate-900">&lt;img');
    expect(out).toContain('&lt;b&gt;</code>');
  });

  it('links only to app paths and https, keeping the words of any other link', () => {
    const out = html(
      [
        '[a](javascript:alert(1)) [b](JavaScript:alert(1)) [c](data:text/html,<b>x</b>)',
        '[d](//evil.example/x) [e](/\\evil.example) [f](http://plain.example)',
        '[g](https://user@evil.example) [h](vbscript:x) [i](/help/kiosks) [j](https://nbr.gov.bd/x)',
      ].join('\n'),
    );
    const hrefs = [...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/help/kiosks', 'https://nbr.gov.bd/x']);
    // The target stops at the first ")", so the rest of "alert(1))" stays as text.
    expect(out.replace(/<[^>]+>/g, '')).toBe('a) b) c d e f g h i j');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('accepts only safe link targets', () => {
    expect(safeHref('/workspace/payroll/runs?tab=1#x')).toBe('/workspace/payroll/runs?tab=1#x');
    expect(safeHref('https://example.com')).toBe('https://example.com');
    for (const bad of [
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,x',
      '//evil.example',
      '/\\evil.example',
      '/\tevil',
      'http://example.com',
      'mailto:a@b.c',
      'https://',
      'https://a@evil.example',
      'help/kiosks',
      '#top',
    ]) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });

  it('reads headings with anchors, lists, notes and code', () => {
    const blocks = parseMarkdown(
      [
        'Intro line one',
        'and two.',
        '',
        '## বেতন প্রক্রিয়া',
        '',
        '## Two-step sign-in',
        '### Two-step sign-in',
        '',
        '- one',
        '- two',
        '  continued',
        '',
        '1. first',
        '2. `GP-1001`',
        '',
        '> A note',
        '> on two lines.',
        '>',
        '> Second paragraph.',
        '',
        '# Not a heading',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'paragraph',
      'heading',
      'heading',
      'heading',
      'list',
      'list',
      'note',
      'paragraph',
    ]);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      content: [{ kind: 'text', text: 'Intro line one and two.' }],
    });
    const ids = blocks.flatMap((b) => (b.kind === 'heading' ? [b.id] : []));
    expect(ids).toEqual(['বেতন-প্রক্রিয়া', 'two-step-sign-in', 'two-step-sign-in-2']);
    expect(blocks[4]).toMatchObject({
      ordered: false,
      items: [[{ text: 'one' }], [{ text: 'two continued' }]],
    });
    expect(blocks[5]).toMatchObject({
      ordered: true,
      items: [[{ text: 'first' }], [{ kind: 'code', text: 'GP-1001' }]],
    });
    expect(blocks[6]).toMatchObject({
      kind: 'note',
      paragraphs: [[{ text: 'A note on two lines.' }], [{ text: 'Second paragraph.' }]],
    });
    expect(html('## Run payroll')).toContain('<h2 id="run-payroll"');
    expect(html('## Run payroll')).toContain('href="#run-payroll"');
  });

  it('keeps escaped and unmatched markup as text', () => {
    expect(parseInline('\\*\\*not bold\\*\\* and **open')).toEqual([
      { kind: 'text', text: '**not bold** and **open' },
    ]);
    expect(plainText('## Title\n\n- **Bold** [link](/help/x)\n\n> note')).toBe(
      'Title\nBold link\nnote',
    );
  });
});
