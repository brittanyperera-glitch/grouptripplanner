import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// vite preview serves whatever dist/ was last built, so e2e without a build step tests a stale app
// and can pass over a broken one (happened 2026-10-15).
describe('playwright config', () => {
  it('builds the app before previewing it', () => {
    const cfg = readFileSync(join(process.cwd(), 'playwright.config.ts'), 'utf8');
    const command = cfg.match(/command:\s*'([^']+)'/)?.[1] ?? '';
    expect(command).toMatch(/vite build\s*&&.*vite preview/);
  });
});
