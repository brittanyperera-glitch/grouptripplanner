import type { Store } from '../types';
import { LocalStore } from './local';
import { SupabaseStore } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app runs on browser-local storage (no Supabase configured). */
export const isLocal = !(url && key);

export function getStore(): Store {
  return url && key ? new SupabaseStore(url, key) : new LocalStore();
}
