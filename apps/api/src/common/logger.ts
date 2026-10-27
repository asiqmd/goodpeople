import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import { currentRequestId } from './request-context.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'pretty';

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Nest's start-up chatter (a line per module and per route), kept for debugging only. */
const QUIET_CONTEXTS = new Set(['InstanceLoader', 'RoutesResolver', 'RouterExplorer']);

const REDACTED = '[redacted]';

/**
 * Keys whose values never reach the log, compared lower-case without separators: credentials,
 * one-time codes, PINs, and identity and account numbers.
 */
const SECRET_KEY = new RegExp(
  '^(authorization|cookie|setcookie|code|codes|pin|otp|nid|tin|passport|identity)$|' +
    '(password|passcode|secret|token|tokens|apikey|privatekey|signature|pin|otp|nidnumber|' +
    'passportnumber|birthregistration|birthregistrationnumber|accountnumber|cardnumber|' +
    '(otp|sms|mfa|kiosk|recovery|verification|signin|login|reset|access)codes?)$',
);

const TEXT_SECRETS: [RegExp, string][] = [
  // Drizzle puts a failed query's parameters (people's data) into its message.
  [/(\nparams: )[\s\S]*?(?=\n\s+at |$)/g, `$1${REDACTED}`],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/([?&](?:token|code|key|secret|password|signature|otp|pin)=)[^&\s"']+/gi, `$1${REDACTED}`],
];

/** Text that is safe to log: no tokens, no secrets in query strings, no query parameters. */
export function scrub(text: string): string {
  return TEXT_SECRETS.reduce((out, [pattern, to]) => out.replace(pattern, to), text);
}

const isSecretKey = (key: string) => SECRET_KEY.test(key.replace(/[^a-z0-9]/gi, '').toLowerCase());

/** A copy of a value that is safe to log: secret keys blanked, text scrubbed, errors described. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrub(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return describeError(value);
  if (value instanceof Date) return value.toISOString();
  if (depth >= 5) return '[…]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSecretKey(key) ? REDACTED : redact(item, depth + 1),
    ]),
  );
}

export interface ErrorDescription {
  name: string;
  message: string;
  stack?: string;
  /** PostgreSQL's SQLSTATE and where it happened; never the row's values. */
  code?: string;
  constraint?: string;
  table?: string;
  column?: string;
  cause?: ErrorDescription;
}

/** What is logged about an error: its stack and causes, without the data it carried. */
export function describeError(error: unknown, depth = 0): ErrorDescription {
  if (!(error instanceof Error)) {
    const text = typeof error === 'string' ? error : JSON.stringify(redact(error));
    return { name: typeof error, message: scrub(text ?? String(error)) };
  }
  const fields = error as Error &
    Partial<Record<'code' | 'constraint' | 'table' | 'column', unknown>>;
  const isPg = typeof fields.code === 'string' && /^[0-9A-Z]{5}$/.test(fields.code);
  // PostgreSQL quotes the offending value last, as in `invalid input syntax for type uuid: "…"`.
  const message = scrub(
    isPg ? error.message.replace(/: ".*"$/s, `: "${REDACTED}"`) : error.message,
  );
  const described: ErrorDescription = { name: error.name, message };
  if (error.stack) described.stack = scrub(error.stack.replace(error.message, () => message));
  for (const key of ['code', 'constraint', 'table', 'column'] as const) {
    const value = fields[key];
    if (typeof value === 'string') described[key] = value;
  }
  if (error.cause !== undefined && depth < 3) {
    described.cause = describeError(error.cause, depth + 1);
  }
  return described;
}

export interface LoggerOptions {
  format: LogFormat;
  level: LogLevel;
  /** Where JSON lines go; standard output unless a test reads them. */
  write?: (line: string) => void;
}

/** One log call, read the way Nest passes it. */
interface Entry {
  message: string;
  fields: Record<string, unknown>;
  context?: string;
  error?: ErrorDescription;
}

/**
 * The API's one logger: Nest's own messages, the services' `Logger` calls and the line per
 * request. JSON lines in production, Nest's readable lines otherwise. Every line carries the
 * request's reference when there is one, and everything is redacted before it is written.
 */
export class AppLogger implements LoggerService {
  private readonly console?: ConsoleLogger;

  constructor(private readonly options: LoggerOptions) {
    if (options.format === 'pretty') {
      this.console = new ConsoleLogger({
        logLevels: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
      });
    }
  }

  log(message: unknown, ...params: unknown[]) {
    this.write('info', message, params);
  }
  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }
  fatal(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }

  /** A structured line, such as the one per request: a short text and its fields. */
  event(
    level: LogLevel,
    context: string,
    message: string,
    fields: Record<string, unknown>,
    error?: unknown,
  ) {
    this.emit(level, {
      message: scrub(message),
      fields: redact(fields) as Record<string, unknown>,
      context,
      ...(error !== undefined && { error: describeError(error) }),
    });
  }

  private write(level: LogLevel, message: unknown, params: unknown[]) {
    const entry = entryOf(message, params);
    const quiet = entry.context !== undefined && QUIET_CONTEXTS.has(entry.context);
    this.emit(quiet ? 'debug' : level, entry);
  }

  private emit(level: LogLevel, { message, fields, context, error }: Entry) {
    if (RANK[level] < RANK[this.options.level]) return;
    const requestId = fields.requestId ?? currentRequestId();
    if (this.console) {
      const pairs = Object.entries({ ...fields, requestId })
        .filter(([, value]) => value !== undefined && value !== null)
        .map(
          ([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`,
        );
      const stackParam = level === 'error' && error?.stack && withCauses(error);
      const detail = error && !stackParam ? withCauses(error) : undefined;
      const text = [message, ...pairs, detail].filter(Boolean).join(' ');
      const params = [...(stackParam ? [stackParam] : []), ...(context ? [context] : [])];
      this.console[level === 'info' ? 'log' : level](text, ...params);
      return;
    }
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      ...(context && { context }),
      message,
      ...(requestId !== undefined && { requestId }),
      ...fields,
      ...(error && { error }),
    });
    if (this.options.write) this.options.write(line);
    else process.stdout.write(`${line}\n`);
  }
}

/**
 * Reads a call as Nest's ConsoleLogger does: a trailing string is the context and a
 * stack-shaped string a stack; an Error, as the message or a parameter, is the error. A
 * message object with a `message` text is a structured line.
 */
function entryOf(message: unknown, params: unknown[]): Entry {
  const rest = [...params];
  const last = rest.at(-1);
  const context = typeof last === 'string' && !isStack(last) ? (rest.pop() as string) : undefined;
  const fields: Record<string, unknown> = {};
  let error: ErrorDescription | undefined;
  let text = '';
  if (message instanceof Error) {
    error = describeError(message);
    text = error.message;
  } else if (typeof message === 'string') {
    text = scrub(message);
  } else if (isStructured(message)) {
    const { message: own, error: cause, ...values } = message;
    text = scrub(own);
    Object.assign(fields, redact(values));
    if (cause !== undefined) error = describeError(cause);
  } else if (message !== undefined) {
    fields.data = redact(message);
  }
  const details: unknown[] = [];
  for (const param of rest) {
    if (param === undefined) continue;
    if (param instanceof Error) error = describeError(param);
    else if (isStack(param)) error = { name: 'Error', message: text, stack: scrub(param) };
    else details.push(redact(param));
  }
  if (details.length > 0) fields.details = details;
  return { message: text, fields, context, error };
}

/** An error's stack followed by its causes', as Node prints them. */
const withCauses = (error: ErrorDescription): string =>
  [
    error.stack ?? error.message,
    ...(error.cause ? [`[cause]: ${withCauses(error.cause)}`] : []),
  ].join('\n');

/** `{ message, error?, ...fields }`: a line with fields, from code that logs through Nest. */
const isStructured = (
  value: unknown,
): value is { message: string; error?: unknown } & Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { message?: unknown }).message === 'string';

const isStack = (value: unknown): value is string =>
  typeof value === 'string' && /\n\s+at .+/.test(value);
