import { writeFileSync } from 'node:fs';
import { buildOpenApi, createApp } from './app.js';
import { loadConfig } from './config.js';

// Writes the OpenAPI spec for client generators (e.g. the Flutter app's tool/gen_api.sh).
const app = await createApp(loadConfig());
const out = new URL('../openapi.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(buildOpenApi(app), null, 2)}\n`);
await app.close();
console.log(`Wrote ${out.pathname}`);
