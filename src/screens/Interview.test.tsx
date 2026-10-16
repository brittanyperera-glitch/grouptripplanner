import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PrefAnswer, PrefStance, PrefTopic } from '../types';
import Interview, { CARDS, personality } from './Interview';
import { CARD_COPY, COPY, PERSONALITY_TITLES, QUIPS, STRETCH_ASK } from './interviewCopy';

type U = ReturnType<typeof userEvent.setup>;
const setup = (initial?: PrefAnswer[]) => {
  const onSave = vi.fn();
  const onDone = vi.fn();
  const user = userEvent.setup();
  render(<Interview me="Alex" initial={initial} onSave={onSave} onDone={onDone} />);
  return { user, onSave, onDone };
};
const chip = (name: string | RegExp) => screen.getByRole('button', { name });
const next = (user: U) => user.click(screen.getByRole('button', { name: /^(Next|Skip, no answer|Done)$/ }));
const toReveal = async (user: U) => { for (let i = 0; i < CARDS.length; i++) await next(user); };
const finish = async (user: U, onSave: ReturnType<typeof vi.fn>): Promise<PrefAnswer[]> => {
  await toReveal(user);
  await user.click(chip(COPY.reveal.cta));
  return onSave.mock.calls[0][0];
};
const host = () => document.querySelector('.iv-host')?.getAttribute('data-host');

const ans = (topic: PrefTopic, picks: Record<string, PrefStance> = {}, noPreference = false): PrefAnswer => ({ topic, picks, noPreference, skipped: false });
const TOPICS = CARDS.map((c) => c.topic);
const full = (over: Partial<Record<PrefTopic, PrefAnswer>> = {}): PrefAnswer[] => TOPICS.map((t) => over[t] ?? ans(t));

describe('Interview quiz', () => {
  it('cycles a chip off, happy, no way, off', async () => {
    const { user } = setup();
    await user.click(chip('Hostel dorm, not set'));
    expect(chip('Hostel dorm, happy')).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip('Hostel dorm, happy'));
    expect(chip('Hostel dorm, no way')).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip('Hostel dorm, no way'));
    expect(chip('Hostel dorm, not set')).toHaveAttribute('aria-pressed', 'false');
  });

  it('No preference clears picks and any pick clears it', async () => {
    const { user } = setup();
    await user.click(chip('Hotel, not set'));
    await user.click(chip('Villa, not set'));
    await user.click(chip(COPY.noPref));
    expect(chip(COPY.noPref)).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Hotel, not set')).toBeInTheDocument();
    await user.click(chip('Villa, not set'));
    expect(chip(COPY.noPref)).toHaveAttribute('aria-pressed', 'false');
  });

  it('skip and no preference are stored differently', async () => {
    const { user, onSave } = setup();
    await next(user);
    await user.click(chip(COPY.noPref));
    await next(user);
    for (let i = 0; i < 4; i++) await next(user);
    await user.click(chip(COPY.reveal.cta));
    const a: PrefAnswer[] = onSave.mock.calls[0][0];
    expect(a[0]).toMatchObject({ topic: 'stayType', skipped: true, noPreference: false });
    expect(a[1]).toMatchObject({ topic: 'rooms', skipped: false, noPreference: true });
  });

  it("None on the dealbreakers card clears the others", async () => {
    const { user } = setup();
    for (let i = 0; i < 5; i++) await next(user);
    await user.click(chip('Dorm beds, not set'));
    expect(chip('Dorm beds, no way')).toBeInTheDocument();
    await user.click(chip(COPY.none));
    expect(chip('Dorm beds, not set')).toBeInTheDocument();
    expect(chip(COPY.none)).toHaveAttribute('aria-pressed', 'true');
  });

  it('Back keeps answers', async () => {
    const { user } = setup();
    await user.click(chip('Boutique, not set'));
    await next(user);
    await user.click(chip('Back'));
    expect(chip('Boutique, happy')).toBeInTheDocument();
    expect(screen.getByText('1 of 6')).toBeInTheDocument();
  });

  it('single-choice cards hold one answer', async () => {
    const { user } = setup();
    await next(user); await next(user);
    await user.click(chip('Under 30, not picked'));
    await user.click(chip('30 to 60, not picked'));
    expect(chip('Under 30, not picked')).toBeInTheDocument();
    expect(chip('30 to 60, picked')).toBeInTheDocument();
  });

  // Changed deliberately (Brittany 2026-10-16): answers save when the last card is done, and the reveal button only closes.
  it('the last card leads to the reveal, which saves in card order; its button then finishes', async () => {
    const { user, onSave, onDone } = setup();
    await user.click(chip('Hostel dorm, not set'));
    await user.click(chip('Hostel dorm, happy'));
    await toReveal(user);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    const a: PrefAnswer[] = onSave.mock.calls[0][0];
    expect(a.map((x) => x.topic)).toEqual(['stayType', 'rooms', 'budget', 'transport', 'journey', 'nos']);
    expect(a[0]).toEqual({ topic: 'stayType', picks: { hostel: 'noway' }, noPreference: false, skipped: false });
    await user.click(chip(COPY.reveal.cta));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Back from the reveal returns to the last card with answers kept', async () => {
    const { user } = setup();
    for (let i = 0; i < 5; i++) await next(user);
    await user.click(chip('Dorm beds, not set'));
    await next(user);
    await user.click(chip('Back'));
    expect(chip('Dorm beds, no way')).toBeInTheDocument();
    expect(screen.getByText('6 of 6')).toBeInTheDocument();
  });

  it('keeps every visible string and label under 25 words, legend on card 1 only', async () => {
    const { user } = setup();
    expect(screen.getByText(COPY.legend)).toBeInTheDocument();
    for (let i = 0; i < 6; i++) {
      const texts = [...document.querySelectorAll('*')].flatMap((el) => [
        ...[...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? ''),
        el.getAttribute('aria-label') ?? '',
      ]);
      for (const t of texts) expect(t.trim().split(/\s+/).filter(Boolean).length).toBeLessThan(25);
      await next(user);
      if (i === 0) expect(screen.queryByText(COPY.legend)).toBeNull();
    }
  });

  it('shows the right host on every card and the quip changes when a chip is picked', async () => {
    const { user } = setup();
    const expected = ['Aunty', 'Aunty', 'Groom', 'Tuktuk', 'Tuktuk', 'Groom'];
    for (let i = 0; i < 6; i++) {
      expect(host()).toBe(expected[i]);
      expect(screen.getByText(CARDS[i].idle)).toBeInTheDocument();
      if (i === 3) {
        await user.click(chip('Bus, not set'));
        expect(screen.getByText(QUIPS['transport:bus'])).toBeInTheDocument();
        expect(screen.queryByText(CARDS[3].idle)).toBeNull();
        await user.click(chip('Bus, happy'));
        await user.click(chip('Bus, no way'));
        expect(screen.getByText(CARDS[3].idle)).toBeInTheDocument();
      }
      await next(user);
    }
  });

  it('shows the host name text for the host avatar', () => {
    setup();
    expect(within(document.querySelector('.iv-host') as HTMLElement).getByText('Aunty')).toBeInTheDocument();
  });

  it('banner on card 1 only, lock line on every card', async () => {
    const { user } = setup();
    for (let i = 0; i < 6; i++) {
      if (i === 0) expect(screen.getByText(COPY.banner)).toBeInTheDocument();
      else expect(screen.queryByText(COPY.banner)).toBeNull();
      expect(screen.getByText(COPY.anonymous)).toBeInTheDocument();
      await next(user);
    }
  });

  describe('max nights', () => {
    it('appears only for a happy stay type and encodes the limit in the key', async () => {
      const { user, onSave } = setup();
      expect(screen.queryByRole('group', { name: 'Nights at Hostel dorm' })).toBeNull();
      await user.click(chip('Hostel dorm, not set'));
      expect(screen.getByRole('group', { name: 'Nights at Hostel dorm' })).toBeInTheDocument();
      expect(chip('Hostel dorm, any nights')).toHaveAttribute('aria-pressed', 'true');
      await user.click(chip('Hostel dorm, up to 2 nights'));
      const a = await finish(user, onSave);
      expect(a[0].picks).toEqual({ hostel: 'happy', 'nights:hostel:2': 'happy' });
    });

    it('replacing the limit removes the old key, and any removes it entirely', async () => {
      const { user, onSave } = setup();
      await user.click(chip('Hotel, not set'));
      await user.click(chip('Hotel, up to 1 night'));
      await user.click(chip('Hotel, up to 3 nights'));
      await user.click(chip('Hotel, any nights'));
      await user.click(chip('Hotel, up to 3 nights'));
      await user.click(chip('Hotel, up to 1 night'));
      await user.click(chip('Hotel, any nights'));
      const a = await finish(user, onSave);
      expect(a[0].picks).toEqual({ hotel: 'happy' });
    });

    it('two successive limits leave exactly one nights key', async () => {
      const { user, onSave } = setup();
      await user.click(chip('Villa, not set'));
      await user.click(chip('Villa, up to 1 night'));
      await user.click(chip('Villa, up to 3 nights'));
      const a = await finish(user, onSave);
      expect(a[0].picks).toEqual({ villa: 'happy', 'nights:villa:3': 'happy' });
    });

    it('moving the type off happy drops its limit', async () => {
      const { user, onSave } = setup();
      await user.click(chip('Hostel dorm, not set'));
      await user.click(chip('Hostel dorm, up to 2 nights'));
      await user.click(chip('Hostel dorm, happy'));
      expect(screen.queryByRole('group', { name: 'Nights at Hostel dorm' })).toBeNull();
      const a = await finish(user, onSave);
      expect(a[0].picks).toEqual({ hostel: 'noway' });
    });
  });

  it('stores the stretch answer under a stretch: key, separate from the band', async () => {
    const { user, onSave } = setup();
    await next(user); await next(user);
    expect(screen.getByText(STRETCH_ASK)).toBeInTheDocument();
    await user.click(chip('Under 30, not picked'));
    await user.click(chip('Stretch +20, not picked'));
    await user.click(chip('Stretch +50, not picked'));
    expect(chip('Under 30, picked')).toBeInTheDocument();
    expect(chip('Stretch +50, picked')).toBeInTheDocument();
    expect(chip('Stretch +20, not picked')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) await next(user);
    await user.click(chip(COPY.reveal.cta));
    const a: PrefAnswer[] = onSave.mock.calls[0][0];
    expect(a[2].topic).toBe('budget');
    expect(a[2].picks).toEqual({ under30: 'happy', 'stretch:plus50': 'happy' });
  });

  it('dealbreakers list exactly the four approved options plus None', async () => {
    const { user } = setup();
    for (let i = 0; i < 5; i++) await next(user);
    const group = screen.getByRole('group', { name: CARD_COPY.nos.ask });
    const names = within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual([COPY.none, 'Dorm beds, not set', 'Shared bathroom, not set', 'Overnight journeys, not set', 'No air con, not set']);
  });

  describe('Start again', () => {
    it('asks first, keeps answers on decline, clears everything and returns to card 1 on confirm', async () => {
      const { user } = setup();
      await user.click(chip('Boutique, not set'));
      await next(user);
      await next(user);
      await user.click(chip('Start again'));
      expect(screen.getByText(COPY.confirmAsk)).toBeInTheDocument();
      expect(screen.getByText('3 of 6')).toBeInTheDocument();
      await user.click(chip(COPY.confirmNo));
      expect(screen.queryByText(COPY.confirmAsk)).toBeNull();
      expect(screen.getByText('3 of 6')).toBeInTheDocument();
      await user.click(chip('Start again'));
      await user.click(chip(COPY.confirmYes));
      expect(screen.getByText('1 of 6')).toBeInTheDocument();
      expect(chip('Boutique, not set')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText(COPY.banner)).toBeInTheDocument();
    });

    // Changed deliberately: the reveal is only reached after the answers were saved, so Start again resets the screen but the
    // saved set stays until the next completion replaces it.
    it('also works from the reveal: the screen resets and the earlier completion stays saved once', async () => {
      const { user, onSave } = setup();
      await user.click(chip('Hotel, not set'));
      await toReveal(user);
      await user.click(chip('Start again'));
      await user.click(chip(COPY.confirmYes));
      expect(screen.getByText('1 of 6')).toBeInTheDocument();
      expect(chip('Hotel, not set')).toBeInTheDocument();
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });
});

describe('personality', () => {
  const T = COPY.titles;
  const t = (a: PrefAnswer[]) => personality(a).title;

  it('picks each of the five titles', () => {
    expect(t(full({ budget: ans('budget', { under30: 'happy' }) }))).toBe(T.backpacker);
    expect(t(full({ stayType: ans('stayType', { hotel: 'happy' }) }))).toBe(T.comfort);
    expect(t(full({ rooms: ans('rooms', { dorm: 'noway' }) }))).toBe(T.comfort);
    expect(t(full({ transport: ans('transport', { tuktuk: 'happy' }), stayType: ans('stayType', { guesthouse: 'happy' }) }))).toBe(T.local);
    expect(t(full({ budget: ans('budget', { '100plus': 'happy' }) }))).toBe(T.spender);
    expect(t(full({ budget: ans('budget', { 'stretch:anything': 'happy' }) }))).toBe(T.spender);
    expect(t(full())).toBe(T.easy);
    expect(t(full({ stayType: ans('stayType', {}, true), rooms: ans('rooms', {}, true), budget: ans('budget', {}, true) }))).toBe(T.easy);
  });

  it('priority order: easygoing, local, spender, backpacker, comfort', () => {
    const noPrefHalf = { stayType: ans('stayType', { hotel: 'happy' }), rooms: ans('rooms', {}, true), budget: ans('budget', { '100plus': 'happy' }), transport: ans('transport', {}, true), journey: ans('journey', {}, true) };
    expect(t(full(noPrefHalf))).toBe(T.easy);
    const local = { transport: ans('transport', { tuktuk: 'happy' }), stayType: ans('stayType', { guesthouse: 'happy', hostel: 'happy' }), budget: ans('budget', { '100plus': 'happy' }) };
    expect(t(full(local))).toBe(T.local);
    expect(t(full({ budget: ans('budget', { under30: 'happy', 'stretch:anything': 'happy' }) }))).toBe(T.spender);
    expect(t(full({ stayType: ans('stayType', { hostel: 'happy', hotel: 'happy' }) }))).toBe(T.backpacker);
  });

  it('lists happy and no way as labels', () => {
    const p = personality(full({ stayType: ans('stayType', { hostel: 'happy', 'nights:hostel:2': 'happy' }), nos: ans('nos', { noac: 'noway' }), budget: ans('budget', { under30: 'happy' }) }));
    expect(p.happy).toEqual(['Hostel dorm', 'Under 30 a night']);
    expect(p.noway).toEqual(['No air con']);
  });

  it('is deterministic and always one of the five titles (100 seeded answer sets)', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const stances: (PrefStance | undefined)[] = [undefined, undefined, 'happy', 'noway'];
    for (let n = 0; n < 100; n++) {
      const a = CARDS.map((c) => {
        const picks: Record<string, PrefStance> = {};
        for (const [k] of c.opts) { const s = stances[Math.floor(rnd() * 4)]; if (s) picks[k] = s; }
        if (c.topic === 'budget' && rnd() < 0.5) picks['stretch:plus20'] = 'happy';
        return ans(c.topic, picks, rnd() < 0.2);
      });
      const first = personality(a);
      expect(personality(JSON.parse(JSON.stringify(a)))).toEqual(first);
      expect(PERSONALITY_TITLES).toContain(first.title);
    }
  });
});

describe('interview copy', () => {
  const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
  const all = [...strings(COPY), ...strings(CARD_COPY), ...strings(QUIPS), STRETCH_ASK];

  it('never says beta and keeps every string under 25 words', () => {
    expect(all.length).toBeGreaterThan(40);
    for (const s of all) {
      expect(s).not.toMatch(/beta/i);
      expect(s).not.toContain('—');
      expect(s.trim().split(/\s+/).length).toBeLessThan(25);
    }
  });

  it('uses the approved strings verbatim', () => {
    expect(COPY.banner).toBe('Only counts are shown. Nobody sees who said what.');
    expect(COPY.legend).toBe("Tap once if you're up for it. Twice if it's a no way.");
    expect(COPY.skip).toBe('Skip, no answer');
    expect(COPY.noPref).toBe("No preference, I'm easy");
    // Changed deliberately (Brittany 2026-10-16): Stays is not live yet, so the button just says Done.
    expect(COPY.reveal.cta).toBe('Done');
    expect(CARD_COPY.stayType.ask).toBe('Where are you willing to lay your head?');
    expect(CARD_COPY.nos.ask).toBe('Any dealbreakers? Things you would never do on this trip.');
  });
});
