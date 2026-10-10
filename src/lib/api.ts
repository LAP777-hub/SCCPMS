import { supabase } from './supabase';

const apiUrl = import.meta.env.VITE_API_URL;

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error('The API URL is not configured. Set VITE_API_URL.');

  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || `API request failed (${response.status}).`);
  return payload as T;
}