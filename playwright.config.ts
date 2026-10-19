import { defineConfig } from '@playwright/test';

// Two builds of the same app: the released plan (what ships) on 5199, and the vote flow it replaced on 5198 (VITE_RELEASE=off),
// which the older specs were written against. Only release.spec.ts runs against the first.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 120_000,
  // Kept only for a failing test, so a flake such as the how-to swipe one can be traced to its cause.
  use: { baseURL: 'http://localhost:5199', channel: 'chrome', headless: true, actionTimeout: 10_000, trace: 'retain-on-failure' },
  projects: [
    { name: 'release', testMatch: /release\.spec\.ts/, use: { baseURL: 'http://localhost:5199' } },
    { name: 'vote-flow', testIgnore: /release\.spec\.ts/, use: { baseURL: 'http://localhost:5198' } },
  ],
  webServer: [
    {
      // Build first: preview alone serves whatever dist/ was last built, so the specs would test a stale app.
      command: 'npx vite build && npx vite preview --port 5199 --strictPort',
      port: 5199,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'VITE_RELEASE=off npx vite build --outDir dist-vote --emptyOutDir && npx vite preview --outDir dist-vote --port 5198 --strictPort',
      port: 5198,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
