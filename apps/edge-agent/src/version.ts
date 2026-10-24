import { readFileSync } from 'node:fs';

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Reported in each heartbeat, so the cloud can tell which sites run an old agent. */
export const AGENT_VERSION = readVersion();
