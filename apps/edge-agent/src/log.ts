export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Plain text lines, one per event, so a site technician can read them in a console window. */
export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const min = LOG_LEVELS.indexOf(minLevel);
  const write = (level: LogLevel) => (message: string) => {
    if (LOG_LEVELS.indexOf(level) < min) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}\n`;
    (level === 'warn' || level === 'error' ? process.stderr : process.stdout).write(line);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return `${error.message} (${code ?? cause.message})`;
  }
  return error.message;
}
