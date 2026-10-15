import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state';
import type { Plan } from '../types';
import { Reveal } from './Reveal';

const snd = vi.hoisted(() => ({
  engineStart: vi.fn(), engineStop: vi.fn(), horn: vi.fn(), thud: vi.fn(), jingle: vi.fn(), stopAll: vi.fn(), unlock: vi.fn(),
  muted: false, isMuted: vi.fn(() => snd.muted), setMuted: vi.fn((m: boolean) => { snd.muted = m; }),
}));
vi.mock('../components/sound', () => snd);

const act1 = (id: string) => ({ kind: 'activity' as const, label: id, hours: 2, itemId: id });
const plan: Plan = {
  route: ['AIR', 'Colombo', 'Kandy', 'AIR'], areas: ['Colombo', 'Kandy and Knuckles'], chosen: ['galleface', 'tooth'],
  dropped: [], travelHours: 3, fits: true, missingMusts: [], score: 0,
  days: [
    { n: 1, area: 'Colombo', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'a', hours: 1, from: 'AIR', to: 'Colombo' }, act1('galleface')] },
    { n: 2, area: 'Kandy and Knuckles', spare: 0, rainSlack: false, entries: [{ kind: 'drive', label: 'b', hours: 3, from: 'Colombo', to: 'Kandy' }, act1('tooth')] },
  ],
};

const WEBDRIVER = navigator.webdriver;
const fullMotion = () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
};
const stage = () => screen.getByRole('dialog').getAttribute('data-stage');
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const mount = async (ui: ReactElement) => { render(ui); await act(async () => { await Promise.resolve(); }); await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  localStorage.clear(); snd.muted = false;
  for (const f of [snd.engineStart, snd.engineStop, snd.horn, snd.thud, snd.jingle, snd.stopAll, snd.unlock, snd.setMuted]) f.mockClear();
  Object.defineProperty(document, 'fonts', { value: { load: async () => [] }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks();
  Object.defineProperty(navigator, 'webdriver', { value: WEBDRIVER, configurable: true });
});

describe('route reveal sound', () => {
  it('putters while driving, honks and thuds at each stop, and plays the jingle on Mission Complete', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fullMotion();
    await mount(<AppProvider><Reveal plan={plan} onClose={() => {}} /></AppProvider>);
    expect(snd.engineStart).not.toHaveBeenCalled();
    let t = 0;
    while (stage() !== 'complete' && t < 60000) { tick(100); t += 100; }
    expect(snd.engineStart).toHaveBeenCalledTimes(3); // two stops plus the leg home
    expect(snd.horn).toHaveBeenCalledTimes(2);
    expect(snd.thud).toHaveBeenCalledTimes(2);
    expect(snd.jingle).toHaveBeenCalledTimes(1);
    expect(snd.engineStop).toHaveBeenCalled();
  });

  it('Skip stops all sound at once and plays no jingle', async () => {
    fullMotion();
    await mount(<AppProvider><Reveal plan={plan} onClose={() => {}} /></AppProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(snd.stopAll).toHaveBeenCalled();
    expect(snd.jingle).not.toHaveBeenCalled();
  });

  it('the speaker button mutes and unmutes, and the engine does not start while muted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fullMotion();
    snd.muted = true;
    await mount(<AppProvider><Reveal plan={plan} onClose={() => {}} /></AppProvider>);
    const btn = screen.getByRole('button', { name: 'Unmute sound' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    tick(3200);
    expect(stage()).toBe('drive');
    expect(snd.engineStart).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(snd.setMuted).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'false');
    expect(snd.engineStart).toHaveBeenCalled();
  });

  it('with motion off there is no engine, but the jingle still plays', async () => {
    render(<AppProvider><Reveal plan={plan} onClose={() => {}} /></AppProvider>);
    await screen.findByRole('dialog');
    expect(snd.engineStart).not.toHaveBeenCalled();
    expect(snd.horn).not.toHaveBeenCalled();
    expect(snd.jingle).toHaveBeenCalledTimes(1);
  });
});
