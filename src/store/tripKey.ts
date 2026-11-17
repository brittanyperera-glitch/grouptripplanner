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

// Also not a 'tp:' key, for the same reason: Start over must keep the organiser key.
export const ADMIN_KEY = 'tp-admin-key';
export const ADMIN_HEADER = 'x-admin-key';

export function readAdminKey(): string | null {
  try { return localStorage.getItem(ADMIN_KEY) || null; } catch { return null; }
}

export function writeAdminKey(key: string): void {
  try { localStorage.setItem(ADMIN_KEY, key); } catch { /* storage unavailable: the key lasts this visit */ }
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

/** Client for organiser writes: both headers on every request, and no session storage so it never fights the main client. */
export function adminClient(url: string, key: string, password: string | undefined, adminKey: string) {
  const headers = { ...(password ? { [TRIP_HEADER]: password } : {}), [ADMIN_HEADER]: adminKey };
  return createClient(url, key, { global: { headers }, auth: { persistSession: false, autoRefreshToken: false } });
}

/** Asks the database whether this organiser key is the current one. Rejects when the server cannot be reached. */
export async function verifyAdminKey(adminKey: string): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error('no connection');
  const { data, error } = await adminClient(url, key, readTripKey() ?? undefined, adminKey).rpc('admin_ok');
  if (error) throw error;
  return data === true;
}
