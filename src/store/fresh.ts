/** Removes this browser's tp: keys, except those `keep` returns true for. */
export function clearLocalProgress(keep: (key: string) => boolean = () => false): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tp:') && !keep(k)) localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing saved to wipe */ }
}

/**
 * Bump EPOCH whenever the shared database is wiped for a fresh start: each browser then forgets its saved progress
 * once (name, votes, seen screens) and opens on the intro. The trip password is not a tp: key, so it stays.
 */
export const EPOCH = '2026-10-16';
const EPOCH_KEY = 'tp-epoch';
export function freshStartForEpoch(): boolean {
  // e2e seeds localStorage after clearing it, which would read as a new epoch; a real browser is never webdriver.
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  try {
    if (localStorage.getItem(EPOCH_KEY) === EPOCH) return false;
    clearLocalProgress();
    localStorage.setItem(EPOCH_KEY, EPOCH);
    return true;
  } catch { return false; }
}

// Opening the app with ?fresh wipes this browser's trip progress (name, votes, suggestions),
// so a tester can start from the intro. Returns the URL without the flag, or null if absent.
export function freshStartFromUrl(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has('fresh')) return null;
  clearLocalProgress();
  url.searchParams.delete('fresh');
  return url.toString();
}
