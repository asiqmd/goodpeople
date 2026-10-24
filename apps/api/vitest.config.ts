import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // End-to-end files share one test database.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
