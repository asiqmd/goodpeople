import { startAgent, type AgentHandle } from './agent.js';
import { ConfigError, loadConfig, redactToken, type AgentConfig } from './config.js';
import { createLogger, errorMessage } from './log.js';
import { AGENT_VERSION } from './version.js';

let config: AgentConfig;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`Good People Edge Agent cannot start.\n${error.message}`);
  console.error('Set these as environment variables or in the JSON file named by GP_AGENT_CONFIG.');
  process.exit(1);
}

const log = createLogger(config.logLevel);
log.info(
  `Good People Edge Agent ${AGENT_VERSION}: cloud ${config.apiUrl}, token ${redactToken(config.token)}, ` +
    `device clocks in ${config.timeZone}, data in ${config.dataDir}`,
);

process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection: ${errorMessage(reason)}`);
});

let agent: AgentHandle;
try {
  agent = await startAgent(config, { log });
} catch (error) {
  log.error(`Could not start: ${errorMessage(error)}`);
  process.exit(1);
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    log.warn(`${signal} again, exiting now`);
    process.exit(1);
  }
  shuttingDown = true;
  log.info(`${signal} received: finishing in-flight work`);
  agent.stop().then(
    () => {
      log.info('Stopped');
      process.exit(0);
    },
    (error: unknown) => {
      log.error(`Shutdown failed: ${errorMessage(error)}`);
      process.exit(1);
    },
  );
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
