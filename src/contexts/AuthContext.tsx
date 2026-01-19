import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  accessDeniedReason: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; accessDenied?: boolean; accessDeniedMessage?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkResellerAccess: (userId: string) => Promise<{ hasAccess: boolean; reason?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);

  const checkAdminRole = async (userId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    
    const isAdminUser = !!data;
    setIsAdmin(isAdminUser);
    return isAdminUser;
  };

  const checkResellerAccess = async (userId: string): Promise<{ hasAccess: boolean; reason?: string }> => {
    // First check if user is admin - admins always have access
    const isAdminUser = await checkAdminRole(userId);
    if (isAdminUser) {
      return { hasAccess: true };
    }

    // Check reseller access
    const { data: resellerAccess } = await supabase
      .from('reseller_access')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!resellerAccess) {
      // No reseller access record - deny access
      return { 
        hasAccess: false, 
        reason: 'Acesso não autorizado. Entre em contato com seu master para ativar seu acesso.' 
      };
    }

    if (!resellerAccess.is_active) {
      return { 
        hasAccess: false, 
        reason: 'Seu acesso foi desativado. Entre em contato com seu master para reativar.' 
      };
    }

    const expiresAt = new Date(resellerAccess.access_expires_at);
    if (expiresAt < new Date()) {
      return { 
        hasAccess: false, 
        reason: 'Seu acesso expirou. Entre em contato com seu master para renovar seu acesso.' 
      };
    }

    return { hasAccess: true };
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          // Defer the access check to avoid deadlock
          setTimeout(async () => {
            const { hasAccess, reason } = await checkResellerAccess(session.user.id);
            if (!hasAccess) {
              setAccessDeniedReason(reason || null);
              // Sign out if access denied
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
            } else {
              setAccessDeniedReason(null);
            }
          }, 0);
        } else {
          setIsAdmin(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        const { hasAccess, reason } = await checkResellerAccess(session.user.id);
        if (!hasAccess) {
          setAccessDeniedReason(reason || null);
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      return { error };
    }

    // Check reseller access after successful login
    if (data.user) {
      const { hasAccess, reason } = await checkResellerAccess(data.user.id);
      if (!hasAccess) {
        // Sign out immediately if access denied
        await supabase.auth.signOut();
        setAccessDeniedReason(reason || null);
        return { 
          error: null, 
          accessDenied: true, 
          accessDeniedMessage: reason 
        };
      }
    }

    setAccessDeniedReason(null);
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      // Clear state first to ensure immediate UI update
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      setAccessDeniedReason(null);
      
      // Then sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Erro ao fazer logout:', error);
      }
      
      // Force navigation to auth page
      window.location.href = '/auth';
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      // Force navigation even on error
      window.location.href = '/auth';
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      isAdmin, 
      accessDeniedReason,
      signIn, 
      signUp, 
      signOut,
      checkResellerAccess 
    }}>
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
