import { useCallback, useEffect, useState } from 'react';
import { clearTripKey, readTripKey, verifyTripKey, writeTripKey } from './tripKey';

export type TripAccess = { status: 'open' | 'checking' | 'gate'; password: string | null; accept(password: string): void };

/**
 * Decides whether the password gate stands in front of the app. A stored password is checked once on
 * start (it only changes when Brittany changes it, and a reload re-checks), so a stale one drops back
 * to the gate instead of loading empty data. An unreachable server lets the app through to its own retry bar.
 */
export function useTripAccess(enabled: boolean): TripAccess {
  const [password, setPassword] = useState<string | null>(() => (enabled ? readTripKey() : null));
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!enabled || !password || verified) return;
    let live = true;
    verifyTripKey(password).then(
      ok => {
        if (!live) return;
        if (ok) setVerified(true); else { clearTripKey(); setPassword(null); }
      },
      () => { if (live) setVerified(true); },
    );
    return () => { live = false; };
  }, [enabled, password, verified]);

  const accept = useCallback((p: string) => { writeTripKey(p); setPassword(p); setVerified(true); }, []);

  if (!enabled) return { status: 'open', password: null, accept };
  if (!password) return { status: 'gate', password: null, accept };
  return { status: verified ? 'open' : 'checking', password, accept };
}
