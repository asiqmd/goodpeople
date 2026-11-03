import QRCode from 'qrcode';
import { idCardsHtml, type IdCard } from '../letters/render.js';

const card = (code: string, name = 'Rahima Khatun'): IdCard => ({
  name,
  code,
  designation: 'Sewing Operator',
  department: 'Line 1',
  bloodGroup: 'B+',
  joinedOn: '1 January 2024',
  emergency: 'Karim (husband) 01712345678',
  photo: null,
});

const render = (cards: IdCard[], language: 'en' | 'bn' = 'en') =>
  idCardsHtml({
    language,
    company: { name: 'My Group Textiles Ltd', details: '', address: 'Konabari, Gazipur' },
    validUntil: null,
    cards,
  });

/** Reads the dark modules back out of a card's QR path, quiet zone removed. */
function modulesOf(svg: string): { size: number; dark: Set<string> } {
  const box = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1]);
  const dark = new Set<string>();
  for (const [, x, y, w] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(w); i++) dark.add(`${Number(x) - 2 + i},${Number(y) - 2}`);
  }
  return { size: box - 4, dark };
}

describe('ID cards', () => {
  it('prints a QR code of the employee code on the front of each card', () => {
    const html = render([card('MG-0001'), card('MG-0002', 'Shirin Akter')]);
    const svgs = [...html.matchAll(/<svg class="qr"[^]*?<\/svg>/g)].map((m) => m[0]);
    expect(svgs).toHaveLength(2);

    for (const [svg, code] of [
      [svgs[0]!, 'MG-0001'],
      [svgs[1]!, 'MG-0002'],
    ] as const) {
      expect(svg).toContain(`aria-label="${code}"`);
      const expected = QRCode.create(code, { errorCorrectionLevel: 'M' }).modules;
      const { size, dark } = modulesOf(svg);
      expect(size).toBe(expected.size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          expect(dark.has(`${x},${y}`)).toBe(Boolean(expected.data[y * size + x]));
        }
      }
    }
    // On the front, after the details and before the back of the same card.
    const front = html.indexOf('MG-0001</b>');
    expect(front).toBeLessThan(html.indexOf(svgs[0]!));
    expect(html.indexOf(svgs[0]!)).toBeLessThan(html.indexOf('Karim (husband)'));
  });

  it('keeps Bangla text and escapes what is printed', () => {
    const html = render([card('MG-<1>', 'রহিমা খাতুন')], 'bn');
    expect(html).toContain('<html lang="bn" dir="ltr">');
    expect(html).toContain('রহিমা খাতুন');
    expect(html).toContain('কর্মী নম্বর');
    expect(html).toContain('aria-label="MG-&lt;1&gt;"');
    expect(html).not.toContain('MG-<1>');
  });
});
