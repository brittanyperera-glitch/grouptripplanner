import type { Store } from '../types';
import { LocalStore } from './local';
import { SupabaseStore } from './supabase';

export function getStore(): Store {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? new SupabaseStore(url, key) : new LocalStore();
}
