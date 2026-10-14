import type { Store } from '../types';
import { LocalStore } from './local';
import { SupabaseStore } from './supabase';

const keys = () => ({
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  key: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
});

/** True when the app runs on browser-local storage (no Supabase configured). */
export const isLocal = !(keys().url && keys().key);

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A production bundle without both keys would give every friend a private local store, so it
 * must not run. Loopback hosts are exempt: that is `vite preview` on a developer machine.
 */
export function connectionMissing(a: { prod: boolean; url?: string; key?: string; host: string }): boolean {
  return a.prod && !(a.url && a.key) && !LOOPBACK.has(a.host);
}

export function connectionMissingNow(): boolean {
  return connectionMissing({ prod: import.meta.env.PROD, ...keys(), host: window.location.hostname });
}

export function getStore(): Store {
  const { url, key } = keys();
  return url && key ? new SupabaseStore(url, key) : new LocalStore();
}
