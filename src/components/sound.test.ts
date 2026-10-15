import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A mocked AudioContext that records what gets scheduled.
let made: Ctx[] = [];
class Node {
  frequency = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() };
  type = ''; buffer: unknown = null; onended: (() => void) | null = null;
  connect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Ctx {
  state = 'suspended'; currentTime = 1; sampleRate = 8000; destination = {};
  oscillators: Node[] = []; sources: Node[] = [];
  resume = vi.fn(() => { this.state = 'running'; return Promise.resolve(); });
  constructor() { made.push(this); }
  createGain() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createOscillator() { const n = new Node(); this.oscillators.push(n); return n; }
  createBufferSource() { const n = new Node(); this.sources.push(n); return n; }
  createBuffer(_c: number, len: number) { const d = new Float32Array(len); return { getChannelData: () => d }; }
}

async function load() {
  vi.resetModules();
  return import('./sound');
}

beforeEach(() => {
  made = [];
  localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = Ctx;
});
afterEach(() => { delete (window as unknown as { AudioContext?: unknown }).AudioContext; });

describe('sound', () => {
  it('creates no AudioContext until unlock() is called from a gesture, and cues are silent before that', async () => {
    const s = await load();
    s.horn(); s.thud(); s.jingle(); s.engineStart();
    expect(made).toHaveLength(0);
    s.unlock();
    expect(made).toHaveLength(1);
    expect(made[0].resume).toHaveBeenCalledTimes(1);
  });

  it('horn is two notes, jingle four, thud a noise burst plus a sine, engine a putter that stops', async () => {
    const s = await load();
    s.unlock();
    const c = made[0];
    s.horn();
    expect(c.oscillators.map(o => o.frequency.value)).toEqual([659, 880]);
    expect(c.oscillators.every(o => o.start.mock.calls.length === 1)).toBe(true);
    c.oscillators.length = 0;
    s.jingle();
    expect(c.oscillators).toHaveLength(4);
    c.oscillators.length = 0;
    s.thud();
    expect(c.sources).toHaveLength(1);
    expect(c.sources[0].start).toHaveBeenCalled();
    expect(c.oscillators).toHaveLength(1);
    c.oscillators.length = 0;
    s.engineStart();
    expect(c.oscillators).toHaveLength(2);
    s.engineStart(); // already running: no second putter
    expect(c.oscillators).toHaveLength(2);
    s.engineStop();
    expect(c.oscillators.every(o => o.stop.mock.calls.length === 1)).toBe(true);
  });

  it('delayed cues are scheduled ahead on the audio clock', async () => {
    const s = await load();
    s.unlock();
    s.horn(0.5);
    expect(made[0].oscillators[0].start).toHaveBeenCalledWith(1.5);
  });

  it('mute suppresses every cue, is remembered under a tp: key, and silences what is playing', async () => {
    const s = await load();
    s.unlock();
    s.engineStart();
    const playing = made[0].oscillators.slice();
    s.setMuted(true);
    expect(localStorage.getItem(s.MUTE_KEY)).toBe('1');
    expect(s.MUTE_KEY.startsWith('tp:')).toBe(true);
    expect(playing.every(o => o.stop.mock.calls.length >= 1)).toBe(true);
    made[0].oscillators.length = 0;
    s.horn(); s.thud(); s.jingle(); s.engineStart();
    expect(made[0].oscillators).toHaveLength(0);
    expect(made[0].sources).toHaveLength(0);
    s.setMuted(false);
    expect(s.isMuted()).toBe(false);
    s.horn();
    expect(made[0].oscillators).toHaveLength(2);
  });

  it('stopAll stops everything at once', async () => {
    const s = await load();
    s.unlock();
    s.engineStart(); s.horn(); s.jingle();
    const all = made[0].oscillators.slice();
    s.stopAll();
    expect(all.every(o => o.stop.mock.calls.length >= 1)).toBe(true);
  });

  it('survives having no Web Audio at all', async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    const s = await load();
    expect(() => { s.unlock(); s.horn(); s.jingle(); s.stopAll(); }).not.toThrow();
  });
});
