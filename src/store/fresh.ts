/** Removes this browser's tp: keys, except those `keep` returns true for. */
export function clearLocalProgress(keep: (key: string) => boolean = () => false): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tp:') && !keep(k)) localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing saved to wipe */ }
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
