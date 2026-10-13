import { createClient } from '@supabase/supabase-js';
import { authCallback } from './authCallback';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
