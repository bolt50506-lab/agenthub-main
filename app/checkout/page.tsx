
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bot, Check, LockKeyhole, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SubscriptionPlan } from '@/lib/types/database';

export default function CheckoutPage() {
  const params = useSearchParams();
  const selectedSlug = params.get('plan') || '';
  const requestedCycle = params.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState('PK');
  const [paymentMethod, setPaymentMethod] = useState('jazzcash');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(requestedCycle);

  useEffect(() => {
    let active = true;
    fetch('/api/public/plans', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || 'Unable to load plans');
        const rows = (result?.plans as SubscriptionPlan[]) ?? [];
        if (!active) return;
        setPlans(rows);
        setPlan(rows.find((item) => item.slug === selectedSlug) || rows[0] || null);
      })
      .catch((error) => {
        console.error('[Checkout] Unable to load plans:', error);
        if (active) {
          setPlans([]);
          setPlan(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedSlug]);

  const annualDiscount = plan ? (plan.slug === 'enterprise' ? 10 : plan.slug === 'starter' ? 4 : 7) : 0;
  const amountCents = plan ? (billingCycle === 'yearly' ? Math.round(Number(plan.price_cents) * 12 * (1 - annualDiscount / 100)) : Number(plan.price_cents)) : 0;

  async function startCheckout(event: FormEvent) {
    event.preventDefault();
    if (!plan) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: plan.slug,
          customerName,
          customerEmail,
          businessName,
          password,
          countryCode,
          paymentMethod,
          billingCycle,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to start checkout');
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout');
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-[#070b18] text-white flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-violet-300" /></div>;

  if (!plan) return <div className="min-h-screen bg-[#070b18] text-white flex flex-col items-center justify-center gap-4"><p>No active plans are available.</p><Link href="/"><Button>Back to AgentHub</Button></Link></div>;

  const price = (amountCents / 100).toFixed(0);

  return (
    <main className="min-h-screen bg-[#070b18] text-white">
      <header className="border-b border-white/10"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6"><Link href="/" className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600"><Bot className="h-5 w-5" /></div><span className="font-bold">AgentHub AI</span></Link><Link href="/#pricing" className="text-sm text-slate-400 hover:text-white"><ArrowLeft className="mr-1 inline h-4 w-4" /> Back to plans</Link></div></header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.05fr_.95fr] lg:py-16 sm:px-6">
        <section>
          <p className="text-sm font-medium text-violet-300">SECURE CHECKOUT</p>
          <h1 className="mt-2 text-4xl font-bold">Create your AgentHub workspace.</h1>
          <p className="mt-3 max-w-xl text-slate-400">Enter your account details, then continue to secure payment. Your AgentHub account and selected plan are activated after verified payment confirmation.</p>

          <form onSubmit={startCheckout} className="mt-8 space-y-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <div><Label className="text-slate-300">Your name</Label><Input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-2 border-white/10 bg-white/[0.04] text-white" placeholder="Your full name" /></div>
              <div><Label className="text-slate-300">Business name</Label><Input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="mt-2 border-white/10 bg-white/[0.04] text-white" placeholder="Your business" /></div>
            </div>
            <div><Label className="text-slate-300">Email address</Label><Input required type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="mt-2 border-white/10 bg-white/[0.04] text-white" placeholder="you@business.com" /></div>
            <div><Label className="text-slate-300">Choose account password</Label><Input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 border-white/10 bg-white/[0.04] text-white" placeholder="Minimum 8 characters" /><p className="mt-2 text-xs text-slate-500">This password is encrypted for the pending checkout and used only to create your account after successful payment.</p></div>
            <div><Label className="text-slate-300">Country</Label><select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#10172a] px-3 text-sm text-white"><option value="PK">Pakistan</option><option value="US">United States</option><option value="AE">United Arab Emirates</option><option value="SA">Saudi Arabia</option><option value="GB">United Kingdom</option><option value="EU">European Union</option><option value="ID">Indonesia</option><option value="MY">Malaysia</option><option value="PH">Philippines</option><option value="BD">Bangladesh</option></select></div>
            <div><Label className="text-slate-300">Billing cycle</Label><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setBillingCycle('monthly')} className={`rounded-xl border px-3 py-3 text-sm font-medium ${billingCycle==='monthly' ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300'}`}>Monthly</button><button type="button" onClick={() => setBillingCycle('yearly')} className={`rounded-xl border px-3 py-3 text-sm font-medium ${billingCycle==='yearly' ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300'}`}>Yearly · Save {annualDiscount}%</button></div></div>
            <div><Label className="text-slate-300">Payment method</Label><div className="mt-2 grid gap-2 sm:grid-cols-3">{[['jazzcash','JazzCash'],['easypaisa','Easypaisa'],['bank_transfer','Bank Transfer']].map(([value,label]) => <button key={value} type="button" onClick={() => setPaymentMethod(value)} className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${paymentMethod===value ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'}`}>{label}</button>)}</div><p className="mt-2 text-xs text-slate-500">Choose your preferred Pakistani payment method. Payment details are shown at checkout.</p></div>
                        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            <Button type="submit" disabled={submitting} className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening secure checkout...</> : <>Continue to payment <LockKeyhole className="ml-2 h-4 w-4" /></>}</Button>
          </form>
        </section>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-white/[0.02] p-6">
            <p className="text-sm text-violet-200">YOUR SELECTED PLAN</p>
            <h2 className="mt-2 text-3xl font-bold">{plan.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">{plan.description || 'AI automation for customer conversations.'}</p>
            <div className="mt-6 flex items-end gap-1 border-b border-white/10 pb-6"><span className="text-5xl font-bold">${price}</span><span className="mb-2 text-sm text-slate-500">/{plan.billing_period}</span></div>
            <ul className="mt-6 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{feature}</li>)}</ul>
            {billingCycle === 'yearly' && <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-center text-xs font-semibold text-emerald-200">{annualDiscount}% yearly discount applied</div>}<div className="mt-6 rounded-xl border border-violet-400/15 bg-violet-500/[0.05] p-4 text-xs text-slate-300">Your selected plan will be activated automatically after successful payment confirmation.</div>
          </div>
        </aside>
      </div>
    </main>
  );
}
