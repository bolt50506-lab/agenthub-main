'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile, Business, BusinessMember } from '@/lib/types/database';

interface SignInResult { error: string | null; profile: Profile | null; }
interface AuthContextValue {
  user: User | null; session: Session | null; profile: Profile | null;
  businesses: Array<{ business: Business; membership: BusinessMember }>;
  activeBusiness: Business | null; activeMembership: BusinessMember | null; loading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>; signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>; setActiveBusiness: (businessId: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function syncAuthCookie(session: Session | null) {
  if (typeof document === 'undefined') return;
  if (session?.access_token) {
    document.cookie = `sb-access-token=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${Math.max(60, (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) - Math.floor(Date.now() / 1000))}; SameSite=Lax; Secure`;
  } else {
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax; Secure';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [businesses, setBusinesses] = useState<Array<{ business: Business; membership: BusinessMember }>>([]);
  const [loading, setLoading] = useState(true);

  const loadProfileAndBusinesses = useCallback(async (userId: string): Promise<SignInResult> => {
    const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profileError) { console.error('[loadProfileAndBusinesses] profile error:', profileError.message); return { profile: null, error: profileError.message }; }
    const loadedProfile = profileData as Profile | null; setProfile(loadedProfile);
    if (loadedProfile && !loadedProfile.is_super_admin) {
      const { data: memberships, error: memberError } = await supabase.from('business_members').select(`*, business:businesses(*)`).eq('user_id', userId).eq('status', 'active');
      if (memberError) console.error('[loadProfileAndBusinesses] membership error:', memberError.message);
      else if (memberships) setBusinesses(memberships.map((m: Record<string, unknown>) => ({ business: m.business as Business, membership: { id: m.id as string, business_id: m.business_id as string, user_id: m.user_id as string, role: m.role as BusinessMember['role'], invited_by: m.invited_by as string | null, status: m.status as string, created_at: m.created_at as string, updated_at: m.updated_at as string } })));
    }
    return { profile: loadedProfile, error: null };
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return; syncAuthCookie(session); setSession(session); setUser(session?.user ?? null); if (!session?.user) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      syncAuthCookie(nextSession); setSession(nextSession);
      setUser((prev) => { const nextId = nextSession?.user?.id ?? null; const prevId = prev?.id ?? null; return nextId === prevId ? prev : (nextSession?.user ?? null); });
      if (event === 'SIGNED_OUT') { setProfile(null); setBusinesses([]); setLoading(false); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); setBusinesses([]); return; }
    let cancelled = false; setLoading(true);
    loadProfileAndBusinesses(user.id).then(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, loadProfileAndBusinesses]);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { error: error?.message ?? 'Unable to sign in.', profile: null };
    syncAuthCookie(data.session);
    return loadProfileAndBusinesses(data.user.id);
  };
  const signOut = async () => { await supabase.auth.signOut(); syncAuthCookie(null); setProfile(null); setBusinesses([]); };
  const refreshProfile = async () => { if (user) await loadProfileAndBusinesses(user.id); };
  const setActiveBusiness = async (businessId: string) => { if (!user) return; await supabase.from('profiles').update({ active_business_id: businessId }).eq('id', user.id); await refreshProfile(); };
  const activeBusiness = profile?.active_business_id ? businesses.find((b) => b.business.id === profile.active_business_id)?.business ?? null : businesses[0]?.business ?? null;
  const activeMembership = profile?.active_business_id ? businesses.find((b) => b.business.id === profile.active_business_id)?.membership ?? null : businesses[0]?.membership ?? null;

  return <AuthContext.Provider value={{ user, session, profile, businesses, activeBusiness, activeMembership, loading, signIn, signOut, refreshProfile, setActiveBusiness }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be used within AuthProvider'); return ctx; }
