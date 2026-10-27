import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { checkXlsxSize, readSheet } from './sheets.js';

/** A zip of deflated entries, with sizes as declared (or lied about). */
function zip(entries: { name: string; data: Buffer; declared?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data, declared } of entries) {
    const packed = deflateRawSync(data);
    const file = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(declared ?? data.length, 22);
    local.writeUInt16LE(file.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(declared ?? data.length, 24);
    central.writeUInt16LE(file.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, file, packed);
    centrals.push(central, file);
    offset += local.length + file.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const refused = (buffer: Buffer) => {
  try {
    checkXlsxSize(buffer);
    return null;
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
};

describe('uploaded spreadsheets', () => {
  it('reads an ordinary workbook', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Employees');
    sheet.addRow(['code', 'name']);
    for (let i = 0; i < 2000; i++) sheet.addRow([`E-${i}`, `Worker ${i}`]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    expect(refused(buffer)).toBeNull();
    const read = await readSheet({ buffer, originalname: 'people.xlsx' }, (c) => c[0] === 'code');
    expect(read.rows).toHaveLength(2000);
  });

  it('refuses archives that unpack too far, whatever they declare', async () => {
    const bomb = zip([{ name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(40 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(100 * 1024);
    expect(refused(bomb)).toBe('spreadsheet_too_large');
    const liar = zip([{ name: 'a.xml', data: Buffer.alloc(40 * 1024 * 1024), declared: 10 }]);
    expect(refused(liar)).toBe('spreadsheet_too_large');
    await expect(
      readSheet({ buffer: bomb, originalname: 'bomb.xlsx' }, () => true),
    ).rejects.toThrow(/unpacks to more/);
  });

  it('refuses extreme ratios and too many entries', () => {
    const dense = zip([{ name: 'a.xml', data: Buffer.alloc(4 * 1024 * 1024) }]);
    expect(refused(dense)).toBe('spreadsheet_too_large');
    const many = zip(
      Array.from({ length: 501 }, (_, i) => ({ name: `x${i}.xml`, data: Buffer.from('<a/>') })),
    );
    expect(refused(many)).toBe('spreadsheet_too_large');
    expect(refused(zip([{ name: 'small.xml', data: Buffer.from('<a/>'.repeat(100)) }]))).toBeNull();
  });

  it('leaves files that are not zips to the reader', () => {
    expect(refused(Buffer.from('code,name\nE-1,Rumana\n'))).toBeNull();
  });
});
