import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isAddressOrRange } from './device-allow.js';
import { SERIAL } from './devices.js';
import { LOG_LEVELS, type LogLevel } from './log.js';
import { assertTimeZone } from './time.js';

export interface AgentConfig {
  /** Base URL of the cloud API, without a trailing slash. */
  apiUrl: string;
  token: string;
  tenantId: string;
  agentId: string;
  /** The zone the devices' clocks are set to. */
  timeZone: string;
  port: number;
  dataDir: string;
  syncIntervalMs: number;
  heartbeatIntervalMs: number;
  /** Hikvision access-control sub-event types that count as a punch. */
  hikvisionEventTypes: number[];
  logLevel: LogLevel;
  /** Device addresses or ranges allowed to push; empty lets any address push. */
  deviceAllow: string[];
  /** Device serial numbers allowed to push; empty lets any serial push. */
  deviceSerials: string[];
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Environment variable for each key of the optional JSON config file. */
const KEYS = {
  apiUrl: 'GP_API_URL',
  agentToken: 'GP_AGENT_TOKEN',
  timeZone: 'GP_TIME_ZONE',
  port: 'GP_PORT',
  dataDir: 'GP_DATA_DIR',
  syncIntervalMs: 'GP_SYNC_INTERVAL_MS',
  heartbeatIntervalMs: 'GP_HEARTBEAT_INTERVAL_MS',
  hikvisionEventTypes: 'GP_HIKVISION_EVENT_TYPES',
  logLevel: 'GP_LOG_LEVEL',
  deviceAllow: 'GP_DEVICE_ALLOW',
  deviceSerials: 'GP_DEVICE_SERIALS',
} as const;
type Key = keyof typeof KEYS;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TOKEN_PATTERN = new RegExp(`^gpe\\.(${UUID})\\.(${UUID})\\.(\\S+)$`, 'i');

/** The token with its secret hidden, safe to print. */
export function redactToken(token: string): string {
  const m = TOKEN_PATTERN.exec(token);
  return m ? `gpe.${m[1]}.${m[2]}.***` : '***';
}

function readFile(path: string, problems: string[]): Partial<Record<Key, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push(`GP_AGENT_CONFIG: cannot read ${path} as JSON (${(error as Error).message})`);
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    problems.push(`GP_AGENT_CONFIG: ${path} must hold a JSON object`);
    return {};
  }
  const out: Partial<Record<Key, string>> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in KEYS)) {
      problems.push(
        `GP_AGENT_CONFIG: unknown key "${key}" (expected ${Object.keys(KEYS).join(', ')})`,
      );
    } else if (value !== null && value !== undefined) {
      out[key as Key] = Array.isArray(value) ? value.join(',') : String(value);
    }
  }
  return out;
}

function positiveInt(
  name: string,
  raw: string | undefined,
  fallback: number,
  problems: string[],
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    problems.push(`${name} must be a whole number from 1 to ${max}, got "${raw}"`);
    return fallback;
  }
  return n;
}

/**
 * Reads the configuration from the environment, with the JSON file named by GP_AGENT_CONFIG as a
 * fallback for each key. Collects every problem before throwing so one restart fixes them all.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const problems: string[] = [];
  const file = env.GP_AGENT_CONFIG ? readFile(env.GP_AGENT_CONFIG, problems) : {};
  const get = (key: Key): string | undefined => {
    const value = env[KEYS[key]];
    return value !== undefined && value.trim() !== '' ? value.trim() : file[key]?.trim();
  };

  let apiUrl = '';
  const rawUrl = get('apiUrl');
  if (!rawUrl) {
    problems.push('GP_API_URL is required, e.g. https://api.goodpeople.example');
  } else {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      if (url.search || url.hash) throw new Error('query');
      apiUrl = url.toString().replace(/\/+$/, '');
    } catch {
      problems.push(`GP_API_URL must be an http(s) URL without a query, got "${rawUrl}"`);
    }
  }

  const token = get('agentToken') ?? '';
  const tokenMatch = TOKEN_PATTERN.exec(token);
  if (!token) {
    problems.push('GP_AGENT_TOKEN is required (it is shown once when the agent is registered)');
  } else if (!tokenMatch) {
    problems.push('GP_AGENT_TOKEN is malformed: expected gpe.<tenant id>.<agent id>.<secret>');
  }

  const timeZone = get('timeZone') ?? 'Asia/Dhaka';
  try {
    assertTimeZone(timeZone);
  } catch {
    problems.push(`GP_TIME_ZONE must be an IANA time zone such as Asia/Dhaka, got "${timeZone}"`);
  }

  const rawTypes = get('hikvisionEventTypes') ?? '1,38,75';
  const hikvisionEventTypes = rawTypes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (hikvisionEventTypes.length === 0 || !hikvisionEventTypes.every(Number.isInteger)) {
    problems.push(`GP_HIKVISION_EVENT_TYPES must be a comma list of numbers, got "${rawTypes}"`);
  }

  const logLevel = (get('logLevel') ?? 'info').toLowerCase() as LogLevel;
  if (!LOG_LEVELS.includes(logLevel)) {
    problems.push(`GP_LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${logLevel}"`);
  }

  const list = (key: Key) =>
    (get(key) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const deviceAllow = list('deviceAllow');
  const badAddresses = deviceAllow.filter((entry) => !isAddressOrRange(entry));
  if (badAddresses.length > 0) {
    problems.push(
      `GP_DEVICE_ALLOW must list IP addresses or ranges such as 192.168.1.0/24, got "${badAddresses.join(', ')}"`,
    );
  }
  const deviceSerials = list('deviceSerials');
  const badSerials = deviceSerials.filter((serial) => !SERIAL.test(serial));
  if (badSerials.length > 0) {
    problems.push(`GP_DEVICE_SERIALS must list serial numbers, got "${badSerials.join(', ')}"`);
  }

  const config: AgentConfig = {
    apiUrl,
    token,
    tenantId: tokenMatch?.[1]?.toLowerCase() ?? '',
    agentId: tokenMatch?.[2]?.toLowerCase() ?? '',
    timeZone,
    port: positiveInt('GP_PORT', get('port'), 8081, problems, 65_535),
    dataDir: resolve(get('dataDir') ?? './data'),
    syncIntervalMs: positiveInt('GP_SYNC_INTERVAL_MS', get('syncIntervalMs'), 10_000, problems),
    heartbeatIntervalMs: positiveInt(
      'GP_HEARTBEAT_INTERVAL_MS',
      get('heartbeatIntervalMs'),
      60_000,
      problems,
    ),
    hikvisionEventTypes,
    logLevel,
    deviceAllow,
    deviceSerials,
  };
  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
