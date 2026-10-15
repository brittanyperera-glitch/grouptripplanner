// Synthesised sound for the route reveal and My trip's drive: Web Audio only, no audio files, nothing fetched.
// The AudioContext is created by unlock(), which callers run from a tap, so autoplay rules are respected; until then every cue is a no-op.

export const MUTE_KEY = 'tp:sound-muted'; // a tp: key, so ?fresh resets it
const MASTER = 0.2;

type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let engine: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
const live = new Set<AudioScheduledSourceNode>();

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setMuted(m: boolean) {
  try { if (m) localStorage.setItem(MUTE_KEY, '1'); else localStorage.removeItem(MUTE_KEY); } catch { /* storage unavailable: mute lasts until reload */ }
  if (m) stopAll();
}

/** Create or resume the audio context. Call only from a tap or click handler. */
export function unlock() {
  if (!ctx) {
    const C: Ctor | undefined = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);
    if (!C) return;
    try {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    } catch { ctx = null; master = null; return; }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* still locked: cues stay silent */ });
}

/** The context and output, or null when cues should stay silent (not unlocked yet, or muted). */
function out(): { c: AudioContext; m: GainNode } | null {
  return ctx && master && !isMuted() ? { c: ctx, m: master } : null;
}

function track<T extends AudioScheduledSourceNode>(n: T): T {
  live.add(n);
  n.onended = () => live.delete(n);
  return n;
}

function tone(c: AudioContext, m: GainNode, type: OscillatorType, hz: number, at: number, dur: number, peak: number) {
  const o = track(c.createOscillator()), g = c.createGain();
  o.type = type;
  o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(m);
  o.start(at); o.stop(at + dur + 0.02);
}

/** Soft tuk-tuk putter: a low sawtooth through a low-pass, its volume pulsing about 8 times a second. Loops until engineStop(). */
export function engineStart() {
  const o = out();
  if (!o || engine) return;
  const { c, m } = o, t = c.currentTime;
  const osc = track(c.createOscillator()), lfo = track(c.createOscillator());
  const lp = c.createBiquadFilter(), g = c.createGain(), depth = c.createGain();
  osc.type = 'sawtooth'; osc.frequency.value = 52;
  lp.type = 'lowpass'; lp.frequency.value = 240;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.25);
  lfo.type = 'square'; lfo.frequency.value = 8;
  depth.gain.value = 0.08;
  lfo.connect(depth); depth.connect(g.gain);
  osc.connect(lp); lp.connect(g); g.connect(m);
  osc.start(t); lfo.start(t);
  engine = { nodes: [osc, lfo], gain: g };
}
export function engineStop() {
  if (!engine || !ctx) { engine = null; return; }
  const { nodes, gain } = engine, t = ctx.currentTime;
  engine = null;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setTargetAtTime(0.0001, t, 0.05);
  for (const n of nodes) n.stop(t + 0.3);
}

/** Cheerful two-note "meep meep" when the tuk-tuk halts. */
export function horn(delay = 0) {
  const o = out();
  if (!o) return;
  const t = o.c.currentTime + delay;
  tone(o.c, o.m, 'square', 659, t, 0.1, 0.18);
  tone(o.c, o.m, 'square', 880, t + 0.14, 0.16, 0.18);
}

/** Soft paper/stamp thud when a day card lands: a short low-passed noise burst under a falling sine. */
export function thud(delay = 0) {
  const o = out();
  if (!o) return;
  const { c, m } = o, t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * 0.12);
  const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = track(c.createBufferSource()), lp = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 600;
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(lp); lp.connect(g); g.connect(m);
  src.start(t);
  const o2 = track(c.createOscillator()), g2 = c.createGain();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(140, t);
  o2.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  g2.gain.setValueAtTime(0.5, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o2.connect(g2); g2.connect(m);
  o2.start(t); o2.stop(t + 0.14);
}

/** Short bright jingle for MISSION COMPLETE / MISSION READY: a rising C major arpeggio. */
export function jingle() {
  const o = out();
  if (!o) return;
  const t = o.c.currentTime;
  [523, 659, 784, 1047].forEach((hz, i) => tone(o.c, o.m, 'triangle', hz, t + i * 0.09, i === 3 ? 0.5 : 0.16, 0.3));
}

/** Silences everything at once (Skip, Close, mute, unmount). */
export function stopAll() {
  engine = null;
  for (const n of [...live]) { try { n.stop(); } catch { /* not started yet, or already stopped */ } }
  live.clear();
}
