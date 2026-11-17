import { useEffect, useRef, useState } from 'react';

/** The one copy of the save feedback that Touchdown and Command show next to the control that saved. */
export const SAVE_COPY = {
  saved: 'Saved',
  unsaved: "Not saved yet, will retry when you're online",
  failed: "Couldn't save",
} as const;

type Status = keyof typeof SAVE_COPY | null;

/**
 * `appError` is the app-wide save error from useApp(): the queue sets it when a write fails and clears it when a
 * retry lands (src/state.ts onClear), so its clearing is the only signal that a queued save went through.
 */
export function useSaveStatus(appError: string | null) {
  const [status, setStatus] = useState<Status>(null);
  // Trap: a write can resolve false before the queue sets its error, so a null error alone proves nothing landed.
  const failedSince = useRef(false);
  useEffect(() => {
    if (status !== 'unsaved') return;
    if (appError !== null) failedSince.current = true;
    else if (failedSince.current) setStatus('saved');
  }, [appError, status]);
  const run = (p: Promise<boolean>) => {
    setStatus(null);
    failedSince.current = appError !== null;
    p.then(ok => setStatus(ok ? 'saved' : 'unsaved'), () => setStatus('failed'));
  };
  return { status, message: status ? SAVE_COPY[status] : '', run };
}
