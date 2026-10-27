import { seedAdminEmail, type Database } from '@gp/db';
import type { NotificationInbox, PaymentAccountView } from '@gp/shared';
import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { Response } from 'supertest';
import { DB } from '../src/db/db.module.js';
import { AccountService } from '../src/modules/account/account.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type LogSender,
} from '../src/modules/notifications/senders.js';
import { payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

type Line = Record<string, unknown> & { requestId?: string; context?: string };

const GENERATED = /^[0-9a-f]{32}$/;
const NID = '1990123456789';

const idOf = (res: Response) => res.headers['x-request-id'] as string;

/** A constraint violation as Drizzle raises it: the PostgreSQL error is the cause. */
const pgFailure = (code: string, constraint: string) =>
  Object.assign(new Error('Failed query: insert …'), {
    cause: Object.assign(new Error('violates'), { code, constraint }),
  });

describe('launch hardening: request ids, error bodies, logs and headers', () => {
  let app: INestApplication;
  let token: string;
  const lines: Line[] = [];

  /** The JSON lines logged for one request, once its line per request is written. */
  async function logged(requestId: string): Promise<Line[]> {
    for (let i = 0; i < 50; i++) {
      const own = lines.filter((l) => l.requestId === requestId);
      if (own.some((l) => l.context === 'HTTP')) return own;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No request line for ${requestId}`);
  }

  beforeAll(async () => {
    const write = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array, ...rest) => {
      const text = chunk.toString();
      if (!text.startsWith('{"time"')) return write(chunk, ...(rest as []));
      for (const line of text.trim().split('\n')) lines.push(JSON.parse(line));
      return true;
    }) as typeof process.stdout.write);
    app = await bootApp({ LOG_FORMAT: 'json', LOG_LEVEL: 'debug' });
    token = (await tenantLogin(app, 'my-group')).accessToken;
  });
  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('gives every response a reference and the security headers', async () => {
    const res = await api(app).get('/reference/bd/divisions').expect(200);
    expect(idOf(res)).toMatch(GENERATED);
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'cross-origin-resource-policy': 'same-site',
    });
    expect(res.headers['cache-control']).toBeUndefined();

    const authed = await api(app).get('/tenant/access').set(bearer(token)).expect(200);
    expect(idOf(authed)).toMatch(GENERATED);
    expect(idOf(authed)).not.toBe(idOf(res));
    expect(authed.headers['cache-control']).toBe('no-store');
    expect(authed.headers['x-frame-options']).toBe('DENY');
  });

  it('keeps file downloads working', async () => {
    const res = await api(app)
      .get('/tenant/imports/employees/template')
      .set(bearer(token))
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('employees-import.xlsx');
    expect(res.headers['x-request-id']).toMatch(GENERATED);
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('echoes a valid incoming reference and replaces an invalid one', async () => {
    const own = `support-${Date.now().toString(36)}`;
    const echoed = await api(app).get('/no-such-route').set('x-request-id', own).expect(404);
    expect(idOf(echoed)).toBe(own);
    expect(echoed.body.requestId).toBe(own);

    for (const bad of ['short', 'has spaces in it', `${'a'.repeat(65)}`, '<script>alert(1)']) {
      const res = await api(app).get('/reference/bd/divisions').set('x-request-id', bad);
      expect(idOf(res)).toMatch(GENERATED);
    }
  });

  it('puts the reference in 404 and validation bodies, and logs no URL', async () => {
    const missing = await api(app).get('/no-such-route/ABCD-1234?token=secret-abc').expect(404);
    expect(missing.body).toMatchObject({ statusCode: 404, requestId: idOf(missing) });

    const invalid = await api(app).post('/auth/login').send({ tenant: 'my-group' }).expect(400);
    expect(invalid.body).toMatchObject({
      statusCode: 400,
      code: 'validation_failed',
      issues: expect.any(Array),
      requestId: idOf(invalid),
    });

    const notFoundLines = await logged(idOf(missing));
    expect(notFoundLines).toEqual([
      expect.objectContaining({
        level: 'info',
        context: 'HTTP',
        method: 'GET',
        route: null,
        status: 404,
        durationMs: expect.any(Number),
        ip: expect.any(String),
      }),
    ]);
    expect(JSON.stringify(notFoundLines)).not.toMatch(/ABCD-1234|secret-abc|token/);
    expect(await logged(idOf(invalid))).toEqual([
      expect.objectContaining({ route: '/auth/login', status: 400, method: 'POST' }),
    ]);
  });

  it('answers malformed and oversized bodies with the reference', async () => {
    const malformed = await api(app)
      .post('/auth/login')
      .set('content-type', 'application/json')
      .send('{"tenant": ')
      .expect(400);
    expect(malformed.body).toMatchObject({ statusCode: 400, requestId: idOf(malformed) });

    const huge = await api(app)
      .post('/auth/login')
      .send({ tenant: 'x'.repeat(200_000) })
      .expect(413);
    expect(huge.body).toMatchObject({
      statusCode: 413,
      message: 'request entity too large',
      requestId: idOf(huge),
    });
  });

  it('logs the line per request with the route pattern, user and workspace, never secrets', async () => {
    const res = await api(app)
      .get('/tenant/access?token=secret-abc')
      .set(bearer(token))
      .expect(200);
    const [line] = await logged(idOf(res));
    expect(line).toMatchObject({
      level: 'info',
      context: 'HTTP',
      message: 'GET /tenant/access 200',
      route: '/tenant/access',
      status: 200,
      userKind: 'tenant',
      tenantId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });

    const health = await api(app).get('/health').expect(200);
    expect(await logged(idOf(health))).toMatchObject([{ level: 'debug', route: '/health' }]);
    expect(JSON.stringify(lines)).not.toContain(token);
    expect(JSON.stringify(lines)).not.toContain('secret-abc');
  });

  it('keeps the reference in the logs of the handler, through body parsing', async () => {
    const password = `Wrong-${Date.now()}!`;
    vi.spyOn(app.get(AuthService), 'loginTenant').mockImplementationOnce(async () => {
      new Logger('Probe').log('checking a sign-in');
      throw new UnauthorizedException();
    });
    const res = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email: seedAdminEmail('my-group'), password })
      .expect(401);
    expect(res.body.requestId).toBe(idOf(res));
    const own = await logged(idOf(res));
    expect(own.map((l) => l.context)).toEqual(['Probe', 'HTTP']);
    expect(JSON.stringify(lines)).not.toContain(password);
    expect(JSON.stringify(lines)).not.toContain(testEnv().password);
  });

  it('answers a database failure with a generic message and logs it in full', async () => {
    const db = app.get<Database>(DB);
    vi.spyOn(app.get(AccountService), 'view').mockImplementationOnce(async () => {
      await db.execute(sql`select nid from no_such_table where nid = ${NID}`);
      throw new Error('unreachable');
    });
    const res = await api(app).get('/account').set(bearer(token)).expect(500);
    const requestId = idOf(res);
    expect(res.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: `Something went wrong. Give support this reference: ${requestId}`,
      code: 'internal_error',
      requestId,
    });
    expect(res.text).not.toMatch(/select|no_such_table|1990123456789|\bat |\/src\/|42P01/);

    const own = await logged(requestId);
    const failure = own.find((l) => l.context === 'ExceptionsHandler')!;
    expect(failure).toMatchObject({
      level: 'error',
      message: 'Request failed',
      route: '/account',
      status: 500,
      error: {
        message: expect.stringContaining('Failed query: select nid from no_such_table'),
        stack: expect.stringContaining('\n    at '),
        cause: { code: '42P01' },
      },
    });
    expect(own.find((l) => l.context === 'HTTP')).toMatchObject({
      level: 'error',
      status: 500,
      userKind: 'tenant',
    });
    expect(JSON.stringify(lines)).not.toContain(NID);
  });

  it('keeps the database filter’s 4xx answers', async () => {
    const account = app.get(AccountService);
    vi.spyOn(account, 'view').mockRejectedValueOnce(pgFailure('23505', 'employees_tenant_code_uq'));
    const duplicate = await api(app).get('/account').set(bearer(token)).expect(409);
    expect(duplicate.body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Another employee already has this employee code',
      code: 'duplicate',
      requestId: idOf(duplicate),
    });

    vi.spyOn(account, 'view').mockRejectedValueOnce(pgFailure('23503', 'employees_tenant_fk'));
    const reference = await api(app).get('/account').set(bearer(token)).expect(400);
    expect(reference.body).toMatchObject({
      code: 'invalid_reference',
      requestId: idOf(reference),
    });
    expect(reference.text).not.toContain('employees_tenant_fk');
  });

  it('sends the exception’s status when its body leaves it out', async () => {
    vi.spyOn(app.get(AccountService), 'view').mockRejectedValueOnce(
      new ForbiddenException({ code: 'signup_disabled', message: 'Sign-up is closed' }),
    );
    const res = await api(app).get('/account').set(bearer(token)).expect(403);
    expect(res.body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Sign-up is closed',
      code: 'signup_disabled',
      requestId: idOf(res),
    });
  });

  it('keeps a deliberate 5xx code but not its internal message', async () => {
    vi.spyOn(app.get(AccountService), 'view').mockRejectedValueOnce(
      new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'PDFs need Chrome or Chromium on the server; set CHROME_PATH',
        code: 'pdf_unavailable',
      }),
    );
    const res = await api(app).get('/account').set(bearer(token)).expect(503);
    expect(res.body).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: `Something went wrong. Give support this reference: ${idOf(res)}`,
      code: 'pdf_unavailable',
      requestId: idOf(res),
    });
  });

  it('refuses a spreadsheet that unpacks too far, before reading it', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Employees').getCell('A1').value = 'x'.repeat(40 * 1024 * 1024);
    const bomb = Buffer.from(await wb.xlsx.writeBuffer());
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const res = await api(app)
      .post('/tenant/imports/employees')
      .set(bearer(token))
      .attach('file', bomb, 'people.xlsx')
      .expect(400);
    expect(res.body).toMatchObject({ code: 'spreadsheet_too_large', requestId: idOf(res) });
  });

  it('never puts what the sign-up form typed into the email', async () => {
    const email = app.get<LogSender<EmailMessage>>(EMAIL_SENDER);
    const to = `bait-${Date.now().toString(36)}@example.test`;
    await api(app)
      .post('/signup')
      .send({
        name: 'Claim your bonus at https://evil.example/pay',
        email: to,
        company: 'Visit evil.example today',
        industryTemplate: 'corporate',
        language: 'en',
        acceptTerms: true,
      })
      .expect(201);
    const sent = email.sent.findLast((m) => m.to === to)!;
    expect(sent.text).toMatch(/\b\d{6}\b/);
    expect(`${sent.subject} ${sent.text}`).not.toMatch(/evil|bonus|Visit/);
  });

  it('tells the employee when the account net pay goes to changes, and the review shows it', async () => {
    const kit = await payrollKit(app);
    const g = await kit.group();
    const { employee, token: own } = await kit.hire(g, { login: true });
    const accounts = async (body: Record<string, unknown>[]) =>
      (
        await api(app)
          .put(`/tenant/employees/${employee.id}/payment-accounts`)
          .set(bearer(kit.admin))
          .send(body)
          .expect(200)
      ).body as PaymentAccountView[];
    const notices = async () =>
      (
        (await api(app).get('/tenant/notifications').set(bearer(own!)).expect(200))
          .body as NotificationInbox
      ).items.filter((n) => n.event === 'payment_account.changed');
    const bank = {
      method: 'bank',
      provider: 'Dutch-Bangla Bank',
      routingNumber: '090270563',
      isPrimary: true,
    };

    const [saved] = await accounts([{ ...bank, accountNumber: '1234567890123' }]);
    expect(await notices()).toMatchObject([
      { body: expect.stringContaining('into the bank account ending 0123') },
    ]);
    // Saving it unchanged, or adding a second account, is not a change of where net pay goes.
    await accounts([
      { ...bank, id: saved!.id },
      { method: 'mfs', provider: 'bkash', accountNumber: '01712345678', isPrimary: false },
    ]);
    expect(await notices()).toHaveLength(1);
    await accounts([
      { method: 'mfs', provider: 'nagad', accountNumber: '01812345679', isPrimary: true },
    ]);
    const told = await notices();
    expect(told[0]).toMatchObject({ body: expect.stringContaining('Nagad account ending 5679') });
    expect(told).toHaveLength(2);
    expect(JSON.stringify(told)).not.toMatch(/01812345679|1234567890123/);

    const run = await kit.run(g, '2026-08');
    await kit.compute(run.id);
    const item = await kit.itemOf(run.id, employee.id);
    expect(Date.parse(item.accountChangedAt!)).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe('API docs', () => {
  it('are not served when API_DOCS is off (the production default)', async () => {
    const closed = await bootApp({ API_DOCS: 'off' });
    try {
      await api(closed).get('/docs-json').expect(404);
    } finally {
      await closed.close();
    }
  });
});
