import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5199', channel: 'chrome', headless: true, actionTimeout: 10_000 },
  webServer: {
    command: 'npx vite preview --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
