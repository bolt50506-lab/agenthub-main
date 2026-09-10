'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock3, CreditCard, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { activeBusiness, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [subscription, setSubscription] = useState<{ status: string; end_date: string | null; trial_ends_at: string | null } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeBusiness) { setChecking(false); return; }
      const { data } = await supabase.from('business_subscriptions').select('status,end_date,trial_ends_at').eq('business_id', activeBusiness.id).maybeSingle();
      if (!cancelled) { setSubscription(data as any); setChecking(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [activeBusiness]);

  const trialEnds = subscription?.trial_ends_at || (activeBusiness as any)?.trial_ends_at || null;
  const isTrial = subscription?.status === 'trial' || activeBusiness?.subscription_status === 'trial';
  const trialExpired = isTrial && !!trialEnds && new Date(trialEnds).getTime() <= Date.now();
  const paidExpired = !isTrial && subscription?.end_date && new Date(subscription.end_date).getTime() < Date.now() && ['active', 'trial'].includes(subscription.status);
  const locked = !!activeBusiness && (trialExpired || !!paidExpired) && pathname !== '/dashboard/billing';

  const remaining = useMemo(() => {
    if (!trialEnds || !isTrial) return null;
    return Math.max(0, Math.ceil((new Date(trialEnds).getTime() - Date.now()) / 86400000));
  }, [trialEnds, isTrial]);

  useEffect(() => {
    if (!loading && !checking && locked) router.replace('/dashboard/billing?expired=1');
  }, [loading, checking, locked, router]);

  if (loading || checking) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  if (locked) return <div className="min-h-[60vh] flex items-center justify-center p-6"><div className="max-w-lg text-center rounded-2xl border border-border bg-card p-8 shadow-sm"><CreditCard className="mx-auto h-12 w-12 text-primary" /><h1 className="mt-4 text-2xl font-bold">Your AgentHub demo has ended</h1><p className="mt-2 text-muted-foreground">Choose a paid plan to restore your workspace and continue using AgentHub.</p><Link href="/dashboard/billing"><Button className="mt-6">Choose a plan</Button></Link></div></div>;

  return <div className="relative">
    {isTrial && remaining !== null && <div className="mx-4 mt-4 flex items-center justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 shrink-0" /><span><strong>7-Day Demo:</strong> {remaining} {remaining === 1 ? 'day' : 'days'} remaining. All features are enabled during your trial.</span></div><Link href="/dashboard/billing" className="shrink-0 font-semibold underline">View plans</Link></div>}
    {children}
  </div>;
}
