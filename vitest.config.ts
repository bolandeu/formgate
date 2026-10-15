// Vitest setup: Lite tests start php -S, so they get long timeouts and a global setup that installs lite/vendor.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/support/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
