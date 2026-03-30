import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    include: ['features/**/*.test.ts'],
    restoreMocks: true,
  },
});
