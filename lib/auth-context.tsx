'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile, Business, BusinessMember } from '@/lib/types/database';

interface SignInResult {
  error: string | null;
  profile: Profile | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  businesses: Array<{ business: Business; membership: BusinessMember }>;
  activeBusiness: Business | null;
  activeMembership: BusinessMember | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setActiveBusiness: (businessId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [businesses, setBusinesses] = useState<Array<{ business: Business; membership: BusinessMember }>>([]);
  const [loading, setLoading] = useState(true);

  const loadProfileAndBusinesses = useCallback(async (userId: string): Promise<SignInResult> => {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[loadProfileAndBusinesses] profile error:', profileError.message);
      return { profile: null, error: profileError.message };
    }

    const loadedProfile = profileData as Profile | null;
    setProfile(loadedProfile);

    if (loadedProfile && !loadedProfile.is_super_admin) {
      const { data: memberships, error: memberError } = await supabase
        .from('business_members')
        .select(`
          *,
          business:businesses(*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (memberError) {
        console.error('[loadProfileAndBusinesses] membership error:', memberError.message);
      } else if (memberships) {
        const mapped = memberships.map((m: Record<string, unknown>) => ({
          business: m.business as Business,
          membership: {
            id: m.id as string,
            business_id: m.business_id as string,
            user_id: m.user_id as string,
            role: m.role as BusinessMember['role'],
            invited_by: m.invited_by as string | null,
            status: m.status as string,
            created_at: m.created_at as string,
            updated_at: m.updated_at as string,
          },
        }));
        setBusinesses(mapped);
      }
    }

    return { profile: loadedProfile, error: null };
  }, []);

  // Effect 1: Subscribe to auth state changes — only set session/user, never query DB here.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      /*
      ------------------------------------------------------------------------
      IMPORTANT: Supabase automatically re-validates the session whenever
      the tab regains focus/visibility (this is Supabase's own behavior,
      not something triggered by this app). That fires this callback with
      a brand-new session/user object even when it's the exact same
      logged-in user - which previously caused Effect 2 below to treat it
      as a real user change, set loading=true, and re-fetch the entire
      profile + business list, making the whole app appear to reload
      every time you switched back to this tab.

      Only update state (and let Effect 2 react) when something actually
      changed - the user id itself, or a genuine sign-out. A same-user
      token refresh updates the session silently without touching
      `user`, so Effect 2's dependency on user.id never fires for it.
      ------------------------------------------------------------------------
      */

      setSession(session);

      setUser((prev) => {
        const nextId = session?.user?.id ?? null;
        const prevId = prev?.id ?? null;
        return nextId === prevId ? prev : (session?.user ?? null);
      });

      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setBusinesses([]);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Effect 2: When the logged-in user actually changes, load profile.
  // Depends on user?.id specifically (not the user object) so a
  // same-user token refresh - which no longer replaces the user object,
  // see Effect 1 above - can never re-trigger this even indirectly.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setBusinesses([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadProfileAndBusinesses(user.id).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user, loadProfileAndBusinesses]);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { error: error?.message ?? 'Unable to sign in.', profile: null };
    }

    // The onAuthStateChange listener will set user, which triggers Effect 2 to load profile.
    // But we also load here so signIn returns the profile for immediate redirect.
    const result = await loadProfileAndBusinesses(data.user.id);
    return result;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setBusinesses([]);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfileAndBusinesses(user.id);
    }
  };

  const setActiveBusiness = async (businessId: string) => {
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ active_business_id: businessId })
      .eq('id', user.id);
    await refreshProfile();
  };

  const activeBusiness = profile?.active_business_id
    ? businesses.find((b) => b.business.id === profile.active_business_id)?.business ?? null
    : businesses[0]?.business ?? null;

  const activeMembership = profile?.active_business_id
    ? businesses.find((b) => b.business.id === profile.active_business_id)?.membership ?? null
    : businesses[0]?.membership ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        businesses,
        activeBusiness,
        activeMembership,
        loading,
        signIn,
        signOut,
        refreshProfile,
        setActiveBusiness,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
