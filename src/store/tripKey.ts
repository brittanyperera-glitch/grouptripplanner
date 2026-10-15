import { createClient } from '@supabase/supabase-js';

// Deliberately not a 'tp:' key: ?fresh and Start over only clear 'tp:' keys, and they must keep the password.
export const TRIP_KEY = 'tp-trip-key';
export const TRIP_HEADER = 'x-trip-key';

export function readTripKey(): string | null {
  try { return localStorage.getItem(TRIP_KEY) || null; } catch { return null; }
}

export function writeTripKey(password: string): void {
  try { localStorage.setItem(TRIP_KEY, password); } catch { /* storage unavailable: the password lasts this visit */ }
}

export function clearTripKey(): void {
  try { localStorage.removeItem(TRIP_KEY); } catch { /* storage unavailable: nothing stored to clear */ }
}

/** Client whose every request carries the trip password; the database policies read it from the header. */
export function tripClient(url: string, key: string, password?: string) {
  return createClient(url, key, password ? { global: { headers: { [TRIP_HEADER]: password } } } : undefined);
}

/** Asks the database whether this password is the current one. Rejects when the server cannot be reached. */
export async function verifyTripKey(password: string): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error('no connection');
  const { data, error } = await tripClient(url, key, password).rpc('trip_ok');
  if (error) throw error;
  return data === true;
}
