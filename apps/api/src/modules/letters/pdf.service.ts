import { existsSync } from 'node:fs';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import puppeteer, { type Browser } from 'puppeteer-core';
import { APP_CONFIG, type AppConfig } from '../../config.js';

/** Parts of a long document rendered at the same time. */
const PARALLEL_PARTS = 4;

/** Where Chrome or Chromium usually lives, when CHROME_PATH is not set. */
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

/**
 * HTML to PDF in headless Chrome, which shapes Bangla conjuncts correctly where most PDF
 * libraries do not. One browser is shared; each document gets its own page with JavaScript
 * off and every request blocked, so a template can never fetch or run anything.
 */
@Injectable()
export class PdfService implements OnApplicationShutdown {
  private readonly logger = new Logger(PdfService.name);
  private browser: Promise<Browser> | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private executable(): string | undefined {
    return this.config.CHROME_PATH ?? CHROME_CANDIDATES.find((path) => existsSync(path));
  }

  private launch(): Promise<Browser> {
    const executablePath = this.executable();
    if (!executablePath) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'PDFs need Chrome or Chromium on the server; set CHROME_PATH',
        code: 'pdf_unavailable',
      });
    }
    const browser = puppeteer.launch({
      executablePath,
      headless: true,
      // Containers usually run as root, where Chrome's sandbox cannot start.
      args: process.getuid?.() === 0 ? ['--no-sandbox', '--disable-gpu'] : ['--disable-gpu'],
    });
    browser.then(
      (b) => b.on('disconnected', () => (this.browser = undefined)),
      () => (this.browser = undefined),
    );
    return browser;
  }

  async render(html: string): Promise<Buffer> {
    this.browser ??= this.launch();
    const browser = await this.browser;
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.url().startsWith('data:')) void request.continue();
        else void request.abort();
      });
      await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
      return Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true }));
    } finally {
      await page.close().catch((error: Error) => this.logger.warn(error.message));
    }
  }

  /**
   * Several HTML documents as one PDF, rendered one after another and joined. Chromium cannot
   * print a document of many hundreds of pages in one go, so long registers come in parts.
   */
  async renderParts(parts: string[]): Promise<Buffer> {
    if (parts.length === 1) return this.render(parts[0]!);
    // A few parts at a time, each in its own tab, joined in order.
    const rendered: Buffer[] = Array.from({ length: parts.length });
    let next = 0;
    const worker = async () => {
      while (next < parts.length) {
        const i = next++;
        rendered[i] = await this.render(parts[i]!);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, parts.length) }, worker));
    const merged = await PDFDocument.create();
    for (const bytes of rendered) {
      const part = await PDFDocument.load(bytes);
      for (const p of await merged.copyPages(part, part.getPageIndices())) merged.addPage(p);
    }
    return Buffer.from(await merged.save());
  }

  async onApplicationShutdown() {
    const browser = await this.browser?.catch(() => undefined);
    await browser?.close();
  }
}
