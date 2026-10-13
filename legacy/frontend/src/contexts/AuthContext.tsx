import React, { createContext, useContext, useState, useEffect } from 'react';
import { type User, setAuthTokens, clearAuthTokens, getCurrentUser, setCurrentUser, clearCurrentUser } from '../lib/auth';
import { authApi } from '../lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, role: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      const savedUser = getCurrentUser();
      
      if (token && savedUser) {
        try {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
          setCurrentUser(currentUser);
        } catch (error) {
          clearAuthTokens();
          clearCurrentUser();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string, role: string) => {
    const response = await authApi.login(username, password, role);
    if (!response.user || !response.access || !response.refresh) {
      throw new Error('The server returned an incomplete login response. Please try again.');
    }
    if (response.user.role !== role) {
      throw new Error('Selected role does not match this account.');
    }
    setAuthTokens(response.access, response.refresh);
    setUser(response.user);
    setCurrentUser(response.user);
  };

  const register = async (data: any) => {
    await authApi.register(data);
  };

  const logout = () => {
    clearAuthTokens();
    clearCurrentUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
