import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Every page here is per-user and dynamic, so Cache Components stays off for Phase 0.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
