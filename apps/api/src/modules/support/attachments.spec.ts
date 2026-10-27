import ExcelJS from 'exceljs';
import { attachmentName, supportFileType } from './attachments.js';

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(
    parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))),
  );

const PNG = bytes([0x89], 'PNG\r\n', [0x1a, 0x0a], 'rest');
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF');
const WEBP = bytes('RIFF', [0x10, 0, 0, 0], 'WEBPVP8 ');
const PDF = bytes('%PDF-1.7\n%%EOF\n');
const EXE = bytes('MZ', [0x90, 0x00, 0x03, 0x00], 'This program cannot be run in DOS mode');

async function workbook() {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Sheet1').addRow(['Code', 'Name']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('supportFileType', () => {
  it('knows images and PDFs by their first bytes, whatever they are called', () => {
    expect(supportFileType(PNG, 'screen.png')).toBe('image/png');
    expect(supportFileType(PNG, 'screen.jpg')).toBe('image/png');
    expect(supportFileType(JPEG, 'photo')).toBe('image/jpeg');
    expect(supportFileType(WEBP, 'shot.webp')).toBe('image/webp');
    expect(supportFileType(PDF, 'payslip.pdf')).toBe('application/pdf');
    // RIFF alone is a WAV or an AVI, not a WebP.
    expect(supportFileType(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '), 'a.webp')).toBe(null);
  });

  it('takes an Excel workbook but no other zip', async () => {
    expect(supportFileType(await workbook(), 'import.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const word = bytes('PK\x03\x04', [0x14, 0], '[Content_Types].xml', 'word/document.xml');
    expect(supportFileType(word, 'letter.xlsx')).toBe(null);
    expect(supportFileType(bytes('PK\x03\x04', [0x14, 0], 'payload.exe'), 'files.xlsx')).toBe(null);
  });

  it('takes UTF-8 text and CSV without NUL bytes', () => {
    expect(supportFileType(Buffer.from('Error at 10:02\nretry'), 'log.txt')).toBe('text/plain');
    expect(supportFileType(Buffer.from('code,name\nE1,রহিম'), 'staff.CSV')).toBe('text/csv');
    expect(supportFileType(Buffer.from('a\u0000b'), 'nul.txt')).toBe(null);
    expect(supportFileType(Buffer.from([0x61, 0xc3, 0x28]), 'bad.txt')).toBe(null);
  });

  it('refuses programs, renamed or not, and empty files', () => {
    expect(supportFileType(EXE, 'setup.exe')).toBe(null);
    expect(supportFileType(EXE, 'screenshot.png')).toBe(null);
    expect(supportFileType(bytes([0x7f], 'ELF', [2, 1, 1, 0]), 'tool.png')).toBe(null);
    expect(supportFileType(Buffer.alloc(0), 'empty.txt')).toBe(null);
  });
});

describe('attachmentName', () => {
  it('drops paths and control characters and keeps a sane length', () => {
    expect(attachmentName('C:\\Users\\rahim\\Desktop\\screen.png', 'image/png')).toBe('screen.png');
    expect(attachmentName('../../etc/passwd.txt', 'text/plain')).toBe('passwd.txt');
    expect(attachmentName('re"port\u0007\n.pdf', 'application/pdf')).toBe('report.pdf');
    expect(attachmentName(`${'a'.repeat(300)}.pdf`, 'application/pdf').length).toBeLessThanOrEqual(
      154,
    );
  });

  it('gives a name the extension of what the file really is', () => {
    expect(attachmentName('notes.html', 'text/plain')).toBe('notes.html.txt');
    expect(attachmentName('photo.JPEG', 'image/jpeg')).toBe('photo.JPEG');
    expect(attachmentName('photo.png', 'image/jpeg')).toBe('photo.png.jpg');
    expect(attachmentName('', 'application/pdf')).toBe('file.pdf');
  });
});
