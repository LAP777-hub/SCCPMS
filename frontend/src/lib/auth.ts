export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  role: 'ADMIN' | 'RECEPTIONIST' | 'DOCTOR' | 'PATIENT';
  is_active: boolean;
  is_staff: boolean;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export function setAuthTokens(access: string, refresh: string): void {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

export function clearAuthTokens(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function getCurrentUser(): User | null {
  const userStr = localStorage.getItem('current_user');
  return userStr ? JSON.parse(userStr) : null;
}

export function setCurrentUser(user: User): void {
  localStorage.setItem('current_user', JSON.stringify(user));
}

export function clearCurrentUser(): void {
  localStorage.removeItem('current_user');
}

export function logout(): void {
  clearAuthTokens();
  clearCurrentUser();
}
