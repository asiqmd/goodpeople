import { writeFileSync } from 'node:fs';
import { PUBLIC_OPENAPI } from './modules/integrations/openapi.js';
// Run with pnpm --filter @gp/api public:openapi after building. No database or server needed.
writeFileSync(
  new URL('../../../docs/api/public-v1.openapi.json', import.meta.url),
  JSON.stringify(PUBLIC_OPENAPI, null, 2) + '\n',
);
