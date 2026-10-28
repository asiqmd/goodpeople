import { Logger } from '@nestjs/common';
import { AppLogger } from '../../common/logger.js';
import { hideCodes, LogSender, type EmailMessage, type SmsMessage } from './senders.js';

describe('the log drivers', () => {
  it('hide six-digit codes and whatever follows the word "code"', () => {
    expect(hideCodes('482913 is your Good People sign-in code for Rupali. Do not share it.')).toBe(
      '[hidden] is your Good People sign-in code [hidden] Rupali. Do not share it.',
    );
    expect(hideCodes('Enter this code: 482913')).toBe('Enter this code: [hidden]');
    expect(hideCodes('{"code":"ABCD-EFGH","codes":["x"]}')).toBe(
      '{"code":"[hidden]","codes":["[hidden]"]}',
    );
    expect(hideCodes('482913 আপনার Good People সাইন-ইন কোড (Rupali)।')).toBe(
      '[hidden] আপনার Good People সাইন-ইন কোড [hidden]।',
    );
    expect(hideCodes('এই কোডটি দিন: ৪৮২৯১৩')).toBe('এই কোডটি [hidden] [hidden]');
    // Phone numbers, dates and words that merely contain "code" stay readable.
    expect(hideCodes('To +8801712345678 on 2026-10-27, codec, barcode')).toBe(
      'To +8801712345678 on 2026-10-27, codec, barcode',
    );
  });

  it('never print a sign-in code unless told to (development), and keep messages for tests', async () => {
    const lines: string[] = [];
    Logger.overrideLogger(
      new AppLogger({ format: 'json', level: 'info', write: (line) => lines.push(line) }),
    );
    try {
      const sms = new LogSender<SmsMessage>('sms');
      const message = { to: '+8801712345678', text: '482913 is your code', reference: 'r-1' };
      await sms.send(message);
      await new LogSender<EmailMessage>('email', true).send({
        to: 'a@example.test',
        subject: 'Code',
        text: 'Your code is 551177',
      });
      expect(sms.sent).toEqual([message]);
      expect(lines[0]).not.toContain('482913');
      expect(lines[0]).toContain('+8801712345678');
      expect(lines[1]).toContain('551177');
    } finally {
      Logger.overrideLogger(new AppLogger({ format: 'json', level: 'error', write: () => {} }));
    }
  });

  it('log an attachment by its size, never its bytes', async () => {
    const lines: string[] = [];
    Logger.overrideLogger(
      new AppLogger({ format: 'json', level: 'info', write: (line) => lines.push(line) }),
    );
    try {
      const pdf = Buffer.from('%PDF-1.4 an accepted offer letter');
      await new LogSender<EmailMessage>('email').send({
        to: 'a@example.test',
        subject: 'Your offer',
        text: 'Attached.',
        attachments: [{ filename: 'offer.pdf', content: pdf, contentType: 'application/pdf' }],
      });
      expect(lines[0]).toContain(`<${pdf.length} bytes>`);
      expect(lines[0]).toContain('offer.pdf');
      expect(lines[0]).not.toContain('"data"');
    } finally {
      Logger.overrideLogger(new AppLogger({ format: 'json', level: 'error', write: () => {} }));
    }
  });
});
