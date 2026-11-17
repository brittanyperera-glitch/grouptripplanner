import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SAVE_COPY, useSaveStatus } from './saveStatus';

describe('useSaveStatus', () => {
  it('says Saved when the write lands straight away', async () => {
    const { result } = renderHook(({ error }) => useSaveStatus(error), { initialProps: { error: null as string | null } });
    await act(async () => { result.current.run(Promise.resolve(true)); });
    expect(result.current.message).toBe(SAVE_COPY.saved);
  });

  it('turns Not saved yet into Saved once the queue lands the retry', async () => {
    const { result, rerender } = renderHook(({ error }) => useSaveStatus(error), { initialProps: { error: "Couldn't save" as string | null } });
    await act(async () => { result.current.run(Promise.resolve(false)); });
    expect(result.current.message).toBe(SAVE_COPY.unsaved);
    rerender({ error: null });
    expect(result.current.message).toBe(SAVE_COPY.saved);
  });

  it('stays Not saved yet until the queue has failed and then cleared, never on a quiet error', async () => {
    const { result, rerender } = renderHook(({ error }) => useSaveStatus(error), { initialProps: { error: null as string | null } });
    await act(async () => { result.current.run(Promise.resolve(false)); });
    expect(result.current.message).toBe(SAVE_COPY.unsaved);
    rerender({ error: "Couldn't save" });
    expect(result.current.message).toBe(SAVE_COPY.unsaved);
    rerender({ error: null });
    expect(result.current.message).toBe(SAVE_COPY.saved);
  });

  it('says Couldn\'t save when the write is refused outright', async () => {
    const { result } = renderHook(() => useSaveStatus(null));
    await act(async () => { result.current.run(Promise.reject(new Error('no'))); });
    expect(result.current.message).toBe(SAVE_COPY.failed);
  });
});
