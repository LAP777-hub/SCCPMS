import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { authCallback } from './authCallback';
import { boundedAuthFetch } from './authFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const memoryAuthStorage = new Map<string, string>();
let memoryOnlyAuthStorage = false;

// Use the same adapter for SDK persistence and forced local logout. The SDK's
// private fallback cannot be cleared when a provider logout request fails.
const authStorage = {
  getItem(key: string) {
    if (memoryOnlyAuthStorage) return memoryAuthStorage.get(key) ?? null;
    try {
      const value = window.localStorage.getItem(key);
      if (value === null) memoryAuthStorage.delete(key);
      else memoryAuthStorage.set(key, value);
      return value;
    } catch {
      memoryOnlyAuthStorage = true;
      return memoryAuthStorage.get(key) ?? null;
    }
  },
  setItem(key: string, value: string) {
    memoryAuthStorage.set(key, value);
    if (memoryOnlyAuthStorage) return;
    try { window.localStorage.setItem(key, value); }
    catch { memoryOnlyAuthStorage = true; }
  },
  removeItem(key: string) {
    memoryAuthStorage.delete(key);
    // Also remove an earlier persisted token if storage writes later failed.
    try { window.localStorage.removeItem(key); }
    catch { memoryOnlyAuthStorage = true; }
  },
} satisfies SupportedStorage;

export function clearStoredAuthSession() {
  for (const suffix of ['', '-user', '-code-verifier']) authStorage.removeItem(`${authStorageKey}${suffix}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: boundedAuthFetch },
  auth: {
    storageKey: authStorageKey,
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !authCallback.emailLinkPending,
    flowType: authCallback.code && !authCallback.accessToken ? 'pkce' : 'implicit',
  },
});

export type Role = 'admin' | 'doctor' | 'patient' | 'receptionist' | 'student' | 'lecturer' | 'staff';

export type Profile = {
  id: string;
  role: Role;
  user_type: string | null;
  student_category: string | null;
  email: string;
  phone: string | null;
  full_name: string | null;
  student_number: string | null;
  staff_number: string | null;
  department: string | null;
  program: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_latitude: number | null;
  address_longitude: number | null;
  address_source: 'manual' | 'photon' | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  next_of_kin_name: string | null;
  next_of_kin_relationship: string | null;
  next_of_kin_phone: string | null;
  created_at: string;
  updated_at: string;
  active?: boolean;
};
