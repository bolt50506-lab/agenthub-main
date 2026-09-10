'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CreditCard, CalendarDays, Receipt, Check, Loader2, AlertTriangle } from 'lucide-react';
import type { SubscriptionPlan } from '@/lib/types/database';

type Sub = { status: string; billing_cycle: string; start_date: string; end_date: string | null; trial_ends_at: string | null; subscription_plans?: { name: string; currency: string } | null };
type Invoice = { id: string; invoice_number: string; amount: number; currency: string; status: string; billing_period_start: string | null; billing_period_end: string | null; paid_at: string | null; created_at: string };
type ReceiptRow = { id: string; receipt_number: string; amount: number; currency: string; issued_at: string; payload: any };

const DISCOUNTS: Record<string, number> = { starter: 4, professional: 7, enterprise: 10 };

export default function BillingPage() {
  const { activeBusiness, session } = useAuth();
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<Sub | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState('jazzcash');
  const [startingPlan, setStartingPlan] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    if (!activeBusiness) return;
    const [s, i, r, p] = await Promise.all([
      supabase.from('business_subscriptions').select('status,billing_cycle,start_date,end_date,trial_ends_at,subscription_plans(name,currency)').eq('business_id', activeBusiness.id).maybeSingle(),
      supabase.from('subscription_invoices').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false }),
      supabase.from('payment_receipts').select('*').eq('business_id', activeBusiness.id).eq('channel', 'subscription').order('issued_at', { ascending: false }),
      supabase.from('subscription_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    ]);
    setSub(s.data as any);
    setInvoices((i.data || []) as Invoice[]);
    setReceipts((r.data || []) as ReceiptRow[]);
    setPlans((p.data || []) as SubscriptionPlan[]);
    if (s.data?.billing_cycle === 'yearly') setCycle('yearly');
  };

  useEffect(() => { load(); }, [activeBusiness]);

  const filtered = useMemo(() => invoices.filter((i) => (!from || i.created_at >= from) && (!to || i.created_at <= to + 'T23:59:59')), [invoices, from, to]);
  const endDate = sub?.status === 'trial' ? sub.trial_ends_at : sub?.end_date;
  const daysLeft = endDate ? Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000) : null;
  const expired = searchParams.get('expired') === '1' || (sub?.status === 'trial' && daysLeft !== null && daysLeft <= 0);

  async function startPayment(plan: SubscriptionPlan) {
    if (!activeBusiness || !session?.access_token) return;
    setStartingPlan(plan.slug); setError('');
    try {
      const response = await fetch('/api/billing/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ businessId: activeBusiness.id, planSlug: plan.slug, billingCycle: cycle, paymentMethod }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to start payment.');
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start payment.');
      setStartingPlan(null);
    }
  }

  return <div className="space-y-6">
    {expired && <Card className="border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"><CardContent className="flex items-start gap-3 p-5"><AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" /><div><p className="font-semibold text-red-900 dark:text-red-200">Your 7-day demo has ended</p><p className="mt-1 text-sm text-red-800/80 dark:text-red-300/80">Choose any plan below and submit payment to restore full AgentHub access. Your workspace and data remain here.</p></div></CardContent></Card>}

    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" />Current Plan</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{sub?.subscription_plans?.name || (sub?.status === 'trial' ? '7-Day Demo' : 'No active plan')}</div><Badge className="mt-2">{sub?.status || 'inactive'}</Badge><p className="mt-3 text-sm text-muted-foreground">{sub?.status === 'trial' ? `${daysLeft === null ? '-' : Math.max(daysLeft, 0)} days remaining` : `${sub?.billing_cycle || '-'} billing`}</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" />Access Until</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{endDate ? new Date(endDate).toLocaleDateString() : '-'}</div><p className="mt-2 text-sm text-muted-foreground">{daysLeft == null ? 'No expiry recorded' : daysLeft >= 0 ? `${daysLeft} days remaining` : 'Expired'}</p></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4" />Payment History</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{invoices.filter((i) => i.status === 'paid').length}</div><p className="mt-2 text-sm text-muted-foreground">Paid subscription bills</p></CardContent></Card>
    </div>

    <Card className="border-violet-200 dark:border-violet-900/50"><CardHeader><CardTitle>Continue with a paid plan</CardTitle><p className="text-sm text-muted-foreground">Your 7-day demo includes the full feature set. Choose a plan below to continue after the demo.</p></CardHeader><CardContent>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex rounded-xl border p-1"><button type="button" onClick={() => setCycle('monthly')} className={`rounded-lg px-4 py-2 text-sm font-medium ${cycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Monthly</button><button type="button" onClick={() => setCycle('yearly')} className={`rounded-lg px-4 py-2 text-sm font-medium ${cycle === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Yearly</button></div><div className="inline-flex rounded-xl border p-1">{[['jazzcash','JazzCash'],['easypaisa','Easypaisa'],['bank_transfer','Bank Alfalah']].map(([v,l]) => <button key={v} type="button" onClick={() => setPaymentMethod(v)} className={`rounded-lg px-3 py-2 text-xs font-medium ${paymentMethod === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{l}</button>)}</div></div>
      {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 lg:grid-cols-3">{plans.map((plan) => { const discount = DISCOUNTS[plan.slug] || 0; const amount = cycle === 'yearly' ? Math.round(Number(plan.price_cents) * 12 * (1 - discount / 100)) : Number(plan.price_cents); return <div key={plan.id} className="flex flex-col rounded-2xl border border-border p-5"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">{plan.name}</h3>{plan.slug === 'professional' && <Badge>Popular</Badge>}</div><div className="mt-4 text-3xl font-bold">{plan.currency} {(amount / 100).toFixed(0)}<span className="text-sm font-normal text-muted-foreground">/{cycle === 'yearly' ? 'year' : 'month'}</span></div>{cycle === 'yearly' && <p className="mt-1 text-xs text-emerald-600">Save {discount}% yearly</p>}<ul className="mt-5 flex-1 space-y-2">{plan.features.slice(0, 8).map((feature) => <li key={feature} className="flex gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{feature}</li>)}</ul><Button className="mt-5 w-full" onClick={() => startPayment(plan)} disabled={startingPlan !== null}>{startingPlan === plan.slug ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening payment...</> : `Choose ${plan.name}`}</Button></div>; })}</div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Monthly Billing & Payment Status</CardTitle><div className="flex gap-3"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Invoice</th><th className="p-3">Period</th><th className="p-3">Amount</th><th className="p-3">Paid</th><th className="p-3">Status</th></tr></thead><tbody>{filtered.map((i) => <tr key={i.id} className="border-b"><td className="p-3 font-medium">{i.invoice_number}</td><td className="p-3">{i.billing_period_start ? new Date(i.billing_period_start).toLocaleDateString() : '-'} → {i.billing_period_end ? new Date(i.billing_period_end).toLocaleDateString() : '-'}</td><td className="p-3">{i.currency} {Number(i.amount).toLocaleString()}</td><td className="p-3">{i.paid_at ? new Date(i.paid_at).toLocaleDateString() : '-'}</td><td className="p-3"><Badge>{i.status}</Badge></td></tr>)}</tbody></table>{!filtered.length && <div className="py-12 text-center text-muted-foreground">No billing records in the selected date range.</div>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Payment Slips / Receipts</CardTitle></CardHeader><CardContent className="space-y-3">{receipts.map((r) => <div key={r.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{r.receipt_number}</p><p className="text-sm text-muted-foreground">{new Date(r.issued_at).toLocaleString()}</p></div><strong>{r.currency} {Number(r.amount).toLocaleString()}</strong></div>)}{!receipts.length && <p className="text-sm text-muted-foreground">Payment slips will appear here after your subscription payment is approved.</p>}</CardContent></Card>
  </div>;
}
