'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bot, Check, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TrialPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/trial/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, businessName, phone, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to start the trial.');
      router.push(`/login?trial=started&email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start the trial.');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 text-white px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between mb-10">
          <Link href="/" className="flex items-center gap-2 font-bold"><Bot className="h-7 w-7" />AgentHub AI</Link>
          <Link href="/login" className="text-sm text-slate-300 hover:text-white"><ArrowLeft className="mr-1 inline h-4 w-4" />Sign in</Link>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1fr_460px] items-center">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-sm text-emerald-200"><ShieldCheck className="h-4 w-4" />7-day free full-feature demo</div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">Test AgentHub with your real business.</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">Create your own workspace and use the complete AgentHub automation experience for 7 days. No paid plan is required during the demo.</p>
            <ul className="mt-7 space-y-3 text-slate-200">
              {['All AI agent capabilities during the demo','WhatsApp, Website Chat and other integrations','Products, knowledge, leads and appointments','Follow-ups, analytics and voice features','7-day countdown shown in your dashboard'].map((item) => <li key={item} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />{item}</li>)}
            </ul>
          </section>

          <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl backdrop-blur">
            <CardHeader><CardTitle>Start your 7-day demo</CardTitle><CardDescription className="text-slate-400">Your trial starts immediately after account creation.</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div><Label className="text-slate-200">Your name</Label><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 border-white/10 bg-white/[0.05] text-white" placeholder="Your full name" /></div>
                <div><Label className="text-slate-200">Business name</Label><Input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="mt-2 border-white/10 bg-white/[0.05] text-white" placeholder="Your business" /></div>
                <div><Label className="text-slate-200">Email address</Label><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 border-white/10 bg-white/[0.05] text-white" placeholder="you@business.com" /></div>
                <div><Label className="text-slate-200">WhatsApp number</Label><Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 border-white/10 bg-white/[0.05] text-white" placeholder="923001234567" /></div>
                <div><Label className="text-slate-200">Password</Label><Input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 border-white/10 bg-white/[0.05] text-white" placeholder="Minimum 8 characters" /></div>
                {error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
                <Button type="submit" disabled={submitting} className="h-12 w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating your demo...</> : 'Start 7-Day Free Demo'}</Button>
                <p className="text-center text-xs text-slate-500">No payment is taken for the demo. After 7 days, choose a paid plan to continue.</p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
