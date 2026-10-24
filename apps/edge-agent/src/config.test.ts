import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, redactToken } from './config.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const AGENT = '22222222-2222-4222-8222-222222222222';
const TOKEN = `gpe.${TENANT}.${AGENT}.top-secret_value`;

const problems = (env: NodeJS.ProcessEnv): string[] => {
  try {
    loadConfig(env);
    return [];
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
};

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('configuration', () => {
  it('applies the defaults', () => {
    expect(loadConfig({ GP_API_URL: 'http://localhost:4000/', GP_AGENT_TOKEN: TOKEN })).toEqual({
      apiUrl: 'http://localhost:4000',
      token: TOKEN,
      tenantId: TENANT,
      agentId: AGENT,
      timeZone: 'Asia/Dhaka',
      port: 8081,
      dataDir: resolve('./data'),
      syncIntervalMs: 10_000,
      heartbeatIntervalMs: 60_000,
      hikvisionEventTypes: [1, 38, 75],
      logLevel: 'info',
    });
  });

  it('reports every problem at once and never echoes the token', () => {
    const found = problems({
      GP_AGENT_TOKEN: 'gpe.not-a-uuid.secret-123',
      GP_TIME_ZONE: 'Mars/Olympus',
      GP_PORT: '99999',
      GP_SYNC_INTERVAL_MS: 'soon',
      GP_HIKVISION_EVENT_TYPES: '1,face',
    });
    expect(found).toHaveLength(6);
    expect(found.join('\n')).toMatch(/GP_API_URL is required/);
    expect(found.join('\n')).toMatch(/GP_AGENT_TOKEN is malformed/);
    expect(found.join('\n')).not.toMatch(/secret-123/);
    expect(problems({ GP_API_URL: 'ftp://x', GP_AGENT_TOKEN: TOKEN })).toEqual([
      expect.stringMatching(/GP_API_URL must be an http\(s\) URL/),
    ]);
    expect(problems({ GP_API_URL: 'http://x' })).toEqual([
      expect.stringMatching(/GP_AGENT_TOKEN is required/),
    ]);
  });

  it('reads a JSON file, with the environment taking precedence', () => {
    dir = mkdtempSync(join(tmpdir(), 'gp-edge-config-'));
    const file = join(dir, 'config.json');
    writeFileSync(
      file,
      JSON.stringify({
        apiUrl: 'https://api.example.com/base',
        agentToken: TOKEN,
        port: 9000,
        hikvisionEventTypes: [1, 75],
      }),
    );
    expect(loadConfig({ GP_AGENT_CONFIG: file, GP_PORT: '8082' })).toMatchObject({
      apiUrl: 'https://api.example.com/base',
      token: TOKEN,
      port: 8082,
      hikvisionEventTypes: [1, 75],
    });
    writeFileSync(file, JSON.stringify({ apiURL: 'https://x', agentToken: TOKEN }));
    expect(problems({ GP_AGENT_CONFIG: file })).toEqual([
      expect.stringMatching(/unknown key "apiURL"/),
      expect.stringMatching(/GP_API_URL is required/),
    ]);
  });

  it('redacts the secret for logs', () => {
    expect(redactToken(TOKEN)).toBe(`gpe.${TENANT}.${AGENT}.***`);
    expect(redactToken('garbage')).toBe('***');
  });
});
