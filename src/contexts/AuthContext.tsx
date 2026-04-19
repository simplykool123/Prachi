import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

export type UserRole = 'admin' | 'staff' | 'accountant' | 'user';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isAuthLoading: boolean;
  isAdmin: boolean;
  isAccountant: boolean;
  isStaff: boolean;
  canAccessFinance: boolean;
  canAccessExpenses: boolean;
  canAccessInventory: boolean;
  canAccessSales: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (username: string, password: string, role: UserRole) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    const resolvedProfile = data || null;
    setProfile(resolvedProfile);
    return resolvedProfile;
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setIsAuthLoading(false);
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsAuthLoading(true);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (username: string, password: string, role: UserRole) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.access_token) return { error: 'Not authenticated. Please reload.' };

    const normalizedUsername = username.trim().toLowerCase();
    const email = `${normalizedUsername}@prachifulagar.app`;

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ username: normalizedUsername, email, password, role }),
      }
    );
    const json = await res.json();
    if (!res.ok) return { error: json.error || 'Failed to create user.' };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const role = profile?.role ?? 'staff';
  const isAdmin = role === 'admin';
  const isAccountant = role === 'accountant';
  const isStaff = role === 'staff' || role === 'user';

  return (
    <AuthContext.Provider value={{
      user, session, profile,
      isAuthLoading,
      isAdmin,
      isAccountant,
      isStaff,
      canAccessFinance: isAdmin || isAccountant,
      canAccessExpenses: isAdmin || isAccountant || isStaff,
      canAccessInventory: isAdmin || isStaff || isAccountant,
      canAccessSales: isAdmin || isStaff || isAccountant,
      signIn, signUp, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
