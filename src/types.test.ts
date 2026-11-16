import { describe, expect, it } from 'vitest';
import { applyAdmin } from './types';
import type { StaysAdmin } from './types';
import { MemoryStore } from './guest/MemoryStore';

const fallen = [{ id: 'a1', area: 'Ella' as const, at: '2026-11-01T10:00' }];
const base: StaysAdmin = { pins: [], scouts: {}, closed: [], fallen };

describe('applyAdmin and fallen', () => {
  it('carries a patch\'s fallen list whole, replacing the stored one', () => {
    const next = [{ id: 'b2', area: 'Kandy and Knuckles' as const, at: '2026-11-02T10:00' }];
    expect(applyAdmin({ ...base, fallen: [] }, { fallen }).fallen).toEqual(fallen);
    expect(applyAdmin(base, { fallen: next }).fallen).toEqual(next);
  });
  it('keeps the stored list when the patch has none', () => {
    expect(applyAdmin(base, { closed: ['Ella'] }).fallen).toEqual(fallen);
    expect(applyAdmin({ pins: [], scouts: {}, closed: [] }, { closed: ['Ella'] }).fallen).toBeUndefined();
  });
  it('is kept through a real store save and read back', async () => {
    const store = new MemoryStore();
    await store.saveStaysAdmin({ fallen });
    await store.saveStaysAdmin({ closed: ['Ella'] });
    expect((await store.load()).stays!.admin.fallen).toEqual(fallen);
  });
});
