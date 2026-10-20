import { useState } from 'react';
import profile from '../content/profile.json';

export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Sri Lanka, Dec 2026' }); return 'shared'; } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}

export const TRAVEL_POSTER = '/img/poster/homecoming.jpg';

/** The poster as a file to share or save. The host rewrites unknown paths to the app page with a 200, so the type is checked as well as the status. */
export async function posterFile(): Promise<File> {
  const res = await fetch(TRAVEL_POSTER);
  const blob = await res.blob();
  if (!res.ok || !blob.type.startsWith('image/')) throw new Error('poster missing');
  return new File([blob], 'the-homecoming-poster.jpg', { type: 'image/jpeg' });
}

/** The illustrated group poster, shown at the end of the route reveal. Save shares or downloads the same file. */
export function TravelPoster() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const save = async () => {
    setBusy(true); setErr(false);
    try { await shareOrDownload(await posterFile()); } catch { setErr(true); }
    setBusy(false);
  };
  return (
    <div className="poster-wrap">
      <img className="poster-art poster-photo" src={TRAVEL_POSTER} alt={profile.backAlt} />
      <button type="button" className="cta" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save poster'}</button>
      {err && <div className="sub warn" role="alert">Could not save. Try a screenshot.</div>}
    </div>
  );
}
