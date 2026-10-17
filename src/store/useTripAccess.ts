import { useCallback, useEffect, useRef, useState } from 'react';
import { clearTripKey, readTripKey, verifyTripKey, writeTripKey } from './tripKey';

export type TripAccess = { status: 'open' | 'checking' | 'gate'; password: string | null; accept(password: string): void; recheck(): void };

/**
 * Decides whether the password gate stands in front of the app. A stored password is checked once on
 * start (it only changes when Brittany changes it, and a reload re-checks), so a stale one drops back
 * to the gate instead of loading empty data. An unreachable server lets the app through to its own retry bar.
 * `recheck` covers a password changed while the app is open: row-level security hides every row from a stale key
 * without raising an error, so the caller asks again when a read comes back empty or fails. At most one check per
 * RECHECK_MIN_MS; an unreachable server never clears the key.
 */
export const RECHECK_MIN_MS = 30_000;

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

  const current = useRef(password);
  current.current = password;
  const lastCheck = useRef(-Infinity);
  const recheck = useCallback(() => {
    const checked = current.current;
    const now = Date.now();
    if (!checked || now - lastCheck.current < RECHECK_MIN_MS) return;
    lastCheck.current = now;
    verifyTripKey(checked).then(
      ok => { if (!ok && current.current === checked) { clearTripKey(); setVerified(false); setPassword(null); } },
      () => undefined,
    );
  }, []);

  if (!enabled) return { status: 'open', password: null, accept, recheck };
  if (!password) return { status: 'gate', password: null, accept, recheck };
  return { status: verified ? 'open' : 'checking', password, accept, recheck };
}
