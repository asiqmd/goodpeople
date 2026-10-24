import { defineConfig } from 'drizzle-kit';

// Generates SQL from src/schema. Row-level security, triggers and grants live in
// hand-written migrations (create one with `pnpm drizzle-kit generate --custom --name <name>`).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
});
