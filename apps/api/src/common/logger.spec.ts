import { Logger } from '@nestjs/common';
import { AppLogger, describeError, redact, scrub } from './logger.js';
import { runInRequestContext } from './request-context.js';

/** A Drizzle query failure as the driver raises it, with people's data in its parameters. */
function failedQuery() {
  const pg = Object.assign(new Error('invalid input syntax for type uuid: "1990123456789"'), {
    code: '22P02',
    detail: 'Key (nid)=(1990123456789) already exists.',
    table: 'employees',
  });
  const error = new Error(
    'Failed query: select "id" from "employees" where "nid" = $1 and "pin" = $2\n' +
      'params: 1990123456789,4321',
    { cause: pg },
  );
  return error;
}

describe('redaction', () => {
  it('blanks credentials, codes, PINs and identity numbers by key', () => {
    expect(
      redact({
        email: 'rumana@example.test',
        password: 'Rupali-2026!',
        newPassword: 'x',
        accessToken: 'a',
        refresh_token: 'b',
        mfaToken: 'c',
        authorization: 'Bearer eyJabc.def.ghi',
        Cookie: 'gp_access=1',
        code: '123456',
        recoveryCodes: ['aaaa-bbbb'],
        kioskCode: 'ABCD',
        pin: '1234',
        attendancePin: '5678',
        identity: { nid: '1990123456789' },
        nid: '1990123456789',
        birthRegistration: '20011234567890123',
        passport: 'A12345678',
        tin: '123456789012',
        accountNumber: '0123456789',
        mfaSecret: 'JBSWY3DP',
        nested: [{ otp: '999999', employeeCode: 'E-001', statusCode: 400 }],
      }),
    ).toEqual({
      email: 'rumana@example.test',
      password: '[redacted]',
      newPassword: '[redacted]',
      accessToken: '[redacted]',
      refresh_token: '[redacted]',
      mfaToken: '[redacted]',
      authorization: '[redacted]',
      Cookie: '[redacted]',
      code: '[redacted]',
      recoveryCodes: '[redacted]',
      kioskCode: '[redacted]',
      pin: '[redacted]',
      attendancePin: '[redacted]',
      identity: '[redacted]',
      nid: '[redacted]',
      birthRegistration: '[redacted]',
      passport: '[redacted]',
      tin: '[redacted]',
      accountNumber: '[redacted]',
      mfaSecret: '[redacted]',
      nested: [{ otp: '[redacted]', employeeCode: 'E-001', statusCode: 400 }],
    });
  });

  it('keeps ids that only look like secret names', () => {
    const ids = { runId: 'r', planId: 'p', loanId: 'l', tenantId: 't', countryCode: 'BD' };
    expect(redact(ids)).toEqual(ids);
  });

  it('scrubs tokens and secrets out of text', () => {
    expect(scrub('auth Bearer eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl failed')).toBe(
      'auth Bearer [redacted] failed',
    );
    expect(scrub('token eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl')).toBe('token [redacted]');
    expect(scrub('GET /pay/return?token=abc123&status=ok&code=9911')).toBe(
      'GET /pay/return?token=[redacted]&status=ok&code=[redacted]',
    );
  });
});

describe('describing errors', () => {
  it('keeps the SQL, stack and SQLSTATE but not the values', () => {
    const described = describeError(failedQuery());
    const text = JSON.stringify(described);
    expect(text).not.toContain('1990123456789');
    expect(text).not.toContain('4321');
    expect(text).not.toContain('already exists');
    expect(described.message).toBe(
      'Failed query: select "id" from "employees" where "nid" = $1 and "pin" = $2\nparams: [redacted]',
    );
    expect(described.stack).toContain('params: [redacted]\n    at ');
    expect(described.cause).toMatchObject({
      message: 'invalid input syntax for type uuid: "[redacted]"',
      code: '22P02',
      table: 'employees',
    });
  });

  it('describes thrown values that are not errors', () => {
    expect(describeError('boom')).toEqual({ name: 'string', message: 'boom' });
    expect(describeError({ token: 'x', reason: 'no' })).toEqual({
      name: 'object',
      message: '{"token":"[redacted]","reason":"no"}',
    });
  });
});

/** A JSON logger at info whose lines a test reads. */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = new AppLogger({
    format: 'json',
    level: 'info',
    write: (line) => lines.push(JSON.parse(line)),
  });
  return { logger, lines };
}

describe('the logger', () => {
  it('writes JSON lines with the request’s reference and the context Nest passes', () => {
    const { logger, lines } = capture();
    runInRequestContext('ref-abcdef', () => logger.log('Invoice issued', 'BillingService'));
    logger.debug('not at info');
    expect(lines).toEqual([
      {
        time: expect.any(String),
        level: 'info',
        context: 'BillingService',
        message: 'Invoice issued',
        requestId: 'ref-abcdef',
      },
    ]);
  });

  it('logs errors with their stacks, however Nest passes them', () => {
    const { logger, lines } = capture();
    logger.error('Sending a sign-in code failed', failedQuery(), 'AuthService');
    const stack = new Error('boom').stack!;
    logger.error('Unhandled', stack, 'ExceptionsHandler');
    expect(lines[0]).toMatchObject({
      level: 'error',
      context: 'AuthService',
      message: 'Sending a sign-in code failed',
      error: { message: expect.stringContaining('params: [redacted]'), cause: { code: '22P02' } },
    });
    expect(lines[1]).toMatchObject({ context: 'ExceptionsHandler', error: { stack } });
    expect(JSON.stringify(lines)).not.toContain('1990123456789');
  });

  it('redacts structured lines and objects', () => {
    const { logger, lines } = capture();
    logger.warn({ message: 'Odd sign-in', requestId: 'ref-123456', password: 'x', error: 'no' });
    logger.log({ to: 'a@example.test', code: '123456' }, 'email:log');
    expect(lines[0]).toEqual({
      time: expect.any(String),
      level: 'warn',
      message: 'Odd sign-in',
      requestId: 'ref-123456',
      password: '[redacted]',
      error: { name: 'string', message: 'no' },
    });
    expect(lines[1]).toMatchObject({ data: { to: 'a@example.test', code: '[redacted]' } });
  });

  it('keeps Nest’s start-up chatter for debugging', () => {
    const { logger, lines } = capture();
    logger.log('Mapped {/health, GET} route', 'RouterExplorer');
    logger.log('Nest application successfully started', 'NestApplication');
    expect(lines.map((l) => l.context)).toEqual(['NestApplication']);
  });

  it('takes Nest’s Logger calls once it is the app’s logger', () => {
    const { logger, lines } = capture();
    Logger.overrideLogger(logger);
    try {
      new Logger('PdfService').warn('Chrome went away');
    } finally {
      Logger.overrideLogger(new AppLogger({ format: 'json', level: 'error', write: () => {} }));
    }
    expect(lines).toMatchObject([
      { level: 'warn', context: 'PdfService', message: 'Chrome went away' },
    ]);
  });
});
