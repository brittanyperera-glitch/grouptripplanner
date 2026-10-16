import { MUTE_KEY } from '../components/sound';

const tpKeys = (): string[] => Object.keys(localStorage).filter(k => k.startsWith('tp:'));

export function snapshotTp(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of tpKeys()) { const v = localStorage.getItem(k); if (v !== null) out[k] = v; }
  } catch { /* storage unavailable */ }
  return out;
}

export function restoreTp(snap: Record<string, string>): void {
  try {
    for (const k of tpKeys()) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
  } catch { /* storage unavailable */ }
}

// Outside the tp: namespace so clearStaleTp never removes it; on disk so a reload or a closed tab cannot lose it.
export const GUEST_SNAP_KEY = 'guest-snapshot';

/** Starts a guest session: saves the visitor's real tp: keys (only if no session is already saved) and clears them. */
export function beginGuest(): void {
  try { if (localStorage.getItem(GUEST_SNAP_KEY) === null) localStorage.setItem(GUEST_SNAP_KEY, JSON.stringify(snapshotTp())); } catch { /* storage unavailable */ }
  clearStaleTp();
}

/** Ends a guest session: puts the visitor's real tp: keys back and forgets the saved copy. */
export function endGuest(): void {
  try {
    const raw = localStorage.getItem(GUEST_SNAP_KEY);
    if (raw === null) return;
    restoreTp(JSON.parse(raw) as Record<string, string>);
    localStorage.removeItem(GUEST_SNAP_KEY);
  } catch { /* storage unavailable */ }
}

/** On a normal (non-guest) start, repairs a guest session that ended by a closed tab instead of Finish and reset. */
export function recoverGuestOnBoot(hash: string): void {
  if (hash !== '#/guest') endGuest();
}

export function clearStaleTp(): void {
  try {
    for (const k of tpKeys()) if (k !== MUTE_KEY) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}
