import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PrefAnswer } from '../types';
import Interview from './Interview';

const setup = (initial?: PrefAnswer[]) => {
  const onSave = vi.fn();
  const onDone = vi.fn();
  const user = userEvent.setup();
  render(<Interview me="Alex" initial={initial} onSave={onSave} onDone={onDone} />);
  return { user, onSave, onDone };
};
const chip = (name: string | RegExp) => screen.getByRole('button', { name });
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /^(Next|Skip, no answer|Done)$/ }));

describe('Interview quiz', () => {
  it('cycles a chip off, happy, no way, off', async () => {
    const { user } = setup();
    await user.click(chip('Hostel, not set'));
    expect(chip('Hostel, happy')).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip('Hostel, happy'));
    expect(chip('Hostel, no way')).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip('Hostel, no way'));
    expect(chip('Hostel, not set')).toHaveAttribute('aria-pressed', 'false');
  });

  it('No preference clears picks and any pick clears it', async () => {
    const { user } = setup();
    await user.click(chip('Hotel, not set'));
    await user.click(chip('Villa, not set'));
    await user.click(chip('No preference'));
    expect(chip('No preference')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Hotel, not set')).toBeInTheDocument();
    await user.click(chip('Villa, not set'));
    expect(chip('No preference')).toHaveAttribute('aria-pressed', 'false');
  });

  it('records skipped for an empty card and noPreference for a deliberate one', async () => {
    const { user, onSave } = setup();
    await next(user);
    await user.click(chip('No preference'));
    await next(user);
    for (let i = 0; i < 4; i++) await next(user);
    await next(user);
    const a: PrefAnswer[] = onSave.mock.calls[0][0];
    expect(a[0]).toMatchObject({ topic: 'stayType', skipped: true, noPreference: false });
    expect(a[1]).toMatchObject({ topic: 'rooms', skipped: false, noPreference: true });
  });

  it('None on the won\'t-do card clears the others', async () => {
    const { user } = setup();
    for (let i = 0; i < 5; i++) await next(user);
    await user.click(chip('Dorm, not set'));
    expect(chip('Dorm, no way')).toBeInTheDocument();
    await user.click(chip('None'));
    expect(chip('Dorm, not set')).toBeInTheDocument();
    expect(chip('None')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Back keeps answers', async () => {
    const { user } = setup();
    await user.click(chip('Boutique, not set'));
    await next(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(chip('Boutique, happy')).toBeInTheDocument();
    expect(screen.getByText('1 of 6')).toBeInTheDocument();
  });

  it('single-choice cards hold one answer', async () => {
    const { user } = setup();
    await next(user); await next(user);
    await user.click(chip('Under £30, not picked'));
    await user.click(chip('£30 to £60, not picked'));
    expect(chip('Under £30, not picked')).toBeInTheDocument();
    expect(chip('£30 to £60, picked')).toBeInTheDocument();
  });

  it('Done saves PrefAnswer[] in card order, then finishes', async () => {
    const { user, onSave, onDone } = setup();
    await user.click(chip('Hostel, not set'));
    await user.click(chip('Hostel, happy'));
    for (let i = 0; i < 5; i++) await next(user);
    expect(onDone).not.toHaveBeenCalled();
    await next(user);
    const a: PrefAnswer[] = onSave.mock.calls[0][0];
    expect(a.map((x) => x.topic)).toEqual(['stayType', 'rooms', 'budget', 'transport', 'journey', 'nos']);
    expect(a[0]).toEqual({ topic: 'stayType', picks: { hostel: 'noway' }, noPreference: false, skipped: false });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(onDone.mock.invocationCallOrder[0]);
  });

  it('keeps every visible string and label under 25 words, legend on card 1 only', async () => {
    const { user } = setup();
    expect(screen.getByText("Tap once if you're happy, twice for no way.")).toBeInTheDocument();
    for (let i = 0; i < 6; i++) {
      const texts = [...document.querySelectorAll('*')].flatMap((el) => [
        ...[...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? ''),
        el.getAttribute('aria-label') ?? '',
      ]);
      for (const t of texts) expect(t.trim().split(/\s+/).filter(Boolean).length).toBeLessThan(25);
      await next(user);
      if (i === 0) expect(screen.queryByText(/Tap once/)).toBeNull();
    }
  });
});
