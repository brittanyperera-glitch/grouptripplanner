import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 120_000,
  // Kept only for a failing test, so a flake such as the how-to swipe one can be traced to its cause.
  use: { baseURL: 'http://localhost:5199', channel: 'chrome', headless: true, actionTimeout: 10_000, trace: 'retain-on-failure' },
  webServer: {
    // Build first: preview alone serves whatever dist/ was last built, so the specs would test a stale app.
    command: 'npx vite build && npx vite preview --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
