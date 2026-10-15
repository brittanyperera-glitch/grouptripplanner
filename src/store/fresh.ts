// Opening the app with ?fresh wipes this browser's trip progress (name, votes, suggestions),
// so a tester can start from the intro. Returns the URL without the flag, or null if absent.
export function freshStartFromUrl(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has('fresh')) return null;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('tp:')) localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing saved to wipe */ }
  url.searchParams.delete('fresh');
  return url.toString();
}
