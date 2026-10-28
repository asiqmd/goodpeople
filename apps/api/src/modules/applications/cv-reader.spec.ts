import { crc32, deflateRawSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  contactsFromText,
  cvText,
  looksLikeLegacyBangla,
  unzip,
  wordXmlText,
} from './cv-reader.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A zip file of these parts, deflated or stored, as Word writes them. */
function zipOf(parts: Record<string, string>, deflate = true): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(parts)) {
    const raw = Buffer.from(content, 'utf8');
    const data = deflate ? deflateRawSync(raw) : raw;
    const fileName = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, data);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(parts).length, 8);
  end.writeUInt16LE(Object.keys(parts).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const wordDocument = (lines: string[], header?: string) =>
  zipOf({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'word/document.xml': `<?xml version="1.0"?><w:document><w:body>${lines.map(paragraph).join('')}</w:body></w:document>`,
    ...(header ? { 'word/header1.xml': `<w:hdr>${paragraph(header)}</w:hdr>` } : {}),
  });

const phone = (text: string) => contactsFromText(text).phone;

describe('reading contact details from a CV', () => {
  it('finds the name at the top, the email and the mobile number', () => {
    const text = [
      'CURRICULUM VITAE',
      'MD. RAKIBUL HASAN',
      'Sewing Machine Operator',
      'House 12, Road 5, Konabari, Gazipur',
      'Mobile: +880 1712-345678 | E-mail: Rakibul.Hasan@Example.com',
      'Career Objective',
    ].join('\n');
    expect(contactsFromText(text)).toEqual({
      fullName: 'Md. Rakibul Hasan',
      email: 'rakibul.hasan@example.com',
      phone: '01712345678',
      legacyBangla: false,
    });
  });

  it('prefers a labelled name, in English or Bangla', () => {
    expect(
      contactsFromText('Resume\nCareer objective\nName : Nusrat Jahan\nFather’s Name: Abdul Karim')
        .fullName,
    ).toBe('Nusrat Jahan');
    expect(
      contactsFromText(
        [
          'জীবনবৃত্তান্ত',
          'নামঃ মোছা. রহিমা খাতুন',
          'পিতার নাম: মো. আব্দুল করিম',
          'মোবাইল: ০১৮১২-৩৪৫৬৭৮',
          'ইমেইল: rahima.khatun@example.com',
        ].join('\n'),
      ),
    ).toEqual({
      fullName: 'মোছা. রহিমা খাতুন',
      email: 'rahima.khatun@example.com',
      phone: '01812345678',
      legacyBangla: false,
    });
  });

  it('reads the usual ways of writing a Bangladeshi mobile number', () => {
    expect(phone('Cell: 01912-345678')).toBe('01912345678');
    expect(phone('Phone (+880) 1512 345678')).toBe('01512345678');
    expect(phone('Contact: +88 017 1234 5678')).toBe('01712345678');
    expect(phone('Tel: 8801612345678')).toBe('01612345678');
    expect(phone('০১৩১২৩৪৫৬৭৮')).toBe('01312345678');
    // Not a mobile number: a land line, a national ID, a date range, a number without its 0.
    expect(phone('Office: 02-9123456')).toBeNull();
    expect(phone('NID: 19901712345678901')).toBeNull();
    expect(phone('2018-2022 2023-2025')).toBeNull();
    expect(phone('1712345678')).toBeNull();
    expect(phone('Mobile: 01212345678, 01712345678')).toBe('01712345678');
  });

  it('finds nothing it would have to guess', () => {
    expect(contactsFromText('')).toEqual({
      fullName: null,
      email: null,
      phone: null,
      legacyBangla: false,
    });
    expect(
      contactsFromText('Curriculum Vitae\nCareer Objective\nTo work in a dynamic organisation')
        .fullName,
    ).toBeNull();
  });

  it('returns nothing for a CV typed in a legacy Bangla font', () => {
    // SutonnyMJ: জীবনবৃত্তান্ত / নাম: মোঃ রফিকুল ইসলাম / ... as the text comes out of the PDF.
    const bijoy = [
      'RxebeÉvšÍ',
      'bvg: †gvt iwdKzj Bmjvg',
      'wcZvi bvg: †gvt AvwRRyj nK',
      'wVKvbv: MÖvg- PÐxcyi, †Rjv- MvRxcyi',
      '‡gvevBj: 01712345678',
    ].join('\n');
    expect(looksLikeLegacyBangla(bijoy)).toBe(true);
    expect(contactsFromText(bijoy)).toEqual({
      fullName: null,
      email: null,
      phone: null,
      legacyBangla: true,
    });
    // A name with an accent is not that.
    expect(looksLikeLegacyBangla('José Martí\nRésumé\nMobile: 01712345678')).toBe(false);
  });

  it('reads the text of a Word document, its header first', async () => {
    const doc = wordDocument(
      ['Sewing Machine Operator', 'Email: shapla &amp; co &lt;shapla.b@example.com&gt;'],
      'Shapla Begum',
    );
    expect(unzip(doc, (n) => n === 'word/document.xml').size).toBe(1);
    expect(unzip(zipOf({ 'word/document.xml': '<w:p/>' }, false), () => true).size).toBe(1);
    const text = await cvText(doc, DOCX);
    expect(text.split('\n')[0]).toBe('Shapla Begum');
    expect(contactsFromText(text)).toMatchObject({
      fullName: 'Shapla Begum',
      email: 'shapla.b@example.com',
    });
    expect(
      wordXmlText(
        '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>',
      ),
    ).toBe('A\tB\n');
  });

  it('reads the text of a PDF, and nothing from a damaged one', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Nusrat Jahan', { x: 50, y: 700, size: 20, font });
    page.drawText('Email: nusrat.jahan@example.com  Mobile: 01712-345678', {
      x: 50,
      y: 670,
      size: 11,
      font,
    });
    const text = await cvText(Buffer.from(await pdf.save()), 'application/pdf');
    expect(contactsFromText(text)).toEqual({
      fullName: 'Nusrat Jahan',
      email: 'nusrat.jahan@example.com',
      phone: '01712345678',
      legacyBangla: false,
    });
    expect(await cvText(Buffer.from('%PDF-1.4\nnot really'), 'application/pdf')).toBe('');
  });
});
