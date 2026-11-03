import { Logger } from '@nestjs/common';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
if (config.PROCESS_ROLE !== 'api') throw new Error('Use the worker entrypoint for scheduled work');
const app = await createApp(config);
await app.listen(config.PORT);
const docs = config.API_DOCS ? ' (docs at /docs)' : '';
new Logger('Main').log(`Good People API on http://localhost:${config.PORT}${docs}`);
