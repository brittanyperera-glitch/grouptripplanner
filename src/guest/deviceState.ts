import { MUTE_KEY } from '../components/sound';
import { EPOCH_KEY } from '../store/fresh';

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

export function clearStaleTp(): void {
  try {
    for (const k of tpKeys()) if (k !== MUTE_KEY && k !== EPOCH_KEY) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}
