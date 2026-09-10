'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SubscriptionPlan } from '@/lib/types/database';
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Database,
  Facebook,
  Globe2,
  HandCoins,
  Instagram,
  MessageCircle,
  Mic2,
  Phone,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  Workflow,
  Zap,
} from 'lucide-react';

const channels = [
  { name: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500', description: 'Chat, voice & sales' },
  { name: 'Instagram', icon: Instagram, color: 'bg-fuchsia-500', description: 'DM automation' },
  { name: 'Facebook', icon: Facebook, color: 'bg-blue-600', description: 'Messenger replies' },
  { name: 'Website', icon: Globe2, color: 'bg-violet-600', description: '24/7 website chat' },
];

const features = [
  [Bot, 'AI Business Operator', 'Your agent does more than answer questions. It can qualify leads, capture details, schedule appointments, trigger follow-ups and move conversations toward the next business action.'],
  [Database, 'Your products, services & prices', 'Give AgentHub your approved business knowledge, products, services and pricing so customers get useful answers instead of generic AI replies.'],
  [Repeat2, 'Automatic follow-ups', 'When a lead goes quiet, AgentHub can follow up automatically with scheduled reminders and re-engagement instead of leaving sales behind.'],
  [CalendarCheck, 'Appointments on autopilot', 'Turn customer conversations into bookings, reminders, rescheduling and cancellations without making your team handle every message manually.'],
  [Mic2, 'Text + natural AI voice', 'Choose text, voice, text + voice or random delivery. Voice replies can follow English, Urdu and Roman Urdu conversations.'],
  [ReceiptText, 'Automatic payment receipts', 'After an approved payment, your customer can receive the receipt automatically — no need to ask your team for it.'],
  [Users, 'Human takeover', 'Your staff stays in control. Take over a conversation whenever a customer needs a person and keep the AI from talking over your team.'],
  [Workflow, 'Multiple AI agents', 'Create focused agents for support, sales, appointments or other workflows while keeping everything in one business workspace.'],
  [Zap, 'Custom welcome messages', 'Start conversations with your own welcome message and business tone — without exposing an internal agent name to your customers.'],
  [ShieldCheck, 'Controlled automation', 'Choose how much autonomy the agent has, with human review and action controls when your business needs them.'],
  [HandCoins, 'Built for Pakistani payments', 'Customers in Pakistan can pay through Easypaisa, JazzCash or bank transfer, with international bank transfer available for other countries.'],
  [Clock3, '24/7 customer response', 'Your business can respond while your team is asleep, busy, or offline — with the same approved business information available around the clock.'],
];

const outcomes = [
  ['Before AgentHub', 'Missed WhatsApp messages', 'Leads waiting for replies', 'Manual follow-ups', 'Scattered customer details'],
  ['With AgentHub', 'Instant AI responses', 'Leads captured automatically', 'Follow-ups on schedule', 'One business workspace'],
];

function annualDiscount(slug: string) {
  if (slug === 'enterprise') return 10;
  if (slug === 'starter') return 4;
  return 7;
}

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.is_super_admin) router.push('/admin');
      else if (!profile.onboarding_completed) router.push('/onboarding');
      else router.push('/dashboard');
    }
  }, [user, profile, loading, router]);

  useEffect(() => {
    let active = true;
    fetch('/api/public/plans', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || 'Unable to load plans');
        if (active) setPlans((result?.plans as SubscriptionPlan[]) ?? []);
      })
      .catch((error) => console.error('[Landing] Unable to load plans:', error))
      .finally(() => { if (active) setPlansLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const scriptId = 'agenthub-public-chat-widget';
    const widgetId = 'agenthub-customer-widget';
    const styleId = 'agenthub-widget-style';
    const businessId = '11f62525-3c27-474d-854e-e474c7211d43';
    const instanceKey = '__AGENTHUB_WIDGET_RUNNING__' + businessId;
    document.getElementById(widgetId)?.remove();
    document.getElementById(styleId)?.remove();
    document.getElementById(scriptId)?.remove();
    delete (window as unknown as Record<string, unknown>)[instanceKey];
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = window.location.origin + '/widget-js?business=' + businessId;
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.getElementById(widgetId)?.remove();
      document.getElementById(styleId)?.remove();
      delete (window as unknown as Record<string, unknown>)[instanceKey];
    };
  }, []);

  const displayPlans = useMemo(() => {
    const order = ['starter', 'basic', 'enterprise'];
    return [...plans].sort((a, b) => {
      const ai = order.indexOf(a.slug);
      const bi = order.indexOf(b.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }).slice(0, 3);
  }, [plans]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src="/agenthub-logo.svg" alt="AgentHub AI" className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-violet-500/25" />
            <div className="leading-none"><div className="text-[17px] font-bold">AgentHub<span className="text-cyan-400"> AI</span></div><div className="mt-1 text-[9px] uppercase tracking-[0.28em] text-slate-500">Automate • Connect • Grow</div></div>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-slate-300 lg:flex"><a href="#solutions" className="hover:text-white">Solutions</a><a href="#features" className="hover:text-white">Features</a><a href="#voice" className="hover:text-white">Voice AI</a><a href="#how" className="hover:text-white">How it works</a><a href="#pricing" className="hover:text-white">Pricing</a></div>
          <div className="flex items-center gap-2 sm:gap-4"><Link href="/login" className="hidden text-sm text-slate-300 hover:text-white sm:block">Sign in</Link><a href="#pricing"><Button size="sm" className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-900/30">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button></a></div>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0"><div className="absolute left-[35%] top-[-240px] h-[650px] w-[650px] rounded-full bg-violet-600/20 blur-[150px]"/><div className="absolute right-[-100px] top-[300px] h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[130px]"/></div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:pb-24 lg:pt-20">
          <div>
            <Badge className="border border-cyan-400/20 bg-cyan-400/10 px-4 py-1.5 text-cyan-200 hover:bg-cyan-400/10"><Sparkles className="mr-2 h-3.5 w-3.5"/> AI customer operations for growing businesses</Badge>
            <h1 className="mt-7 max-w-3xl text-5xl font-bold leading-[.98] tracking-[-.045em] sm:text-6xl lg:text-[68px]">Stop losing customers in your inbox.<span className="mt-2 block bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">Let AgentHub handle the work.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">One AI business assistant that answers customers, understands your products and prices, captures leads, books appointments, follows up, and takes action across your channels.</p>
            <div className="mt-7 flex flex-wrap gap-2">{channels.map((channel) => {const Icon=channel.icon; return <span key={channel.name} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.045] px-3 py-2 text-xs"><span className={`flex h-6 w-6 items-center justify-center rounded-full ${channel.color}`}><Icon className="h-3.5 w-3.5"/></span><span><b>{channel.name}</b><span className="ml-1.5 text-slate-500">{channel.description}</span></span></span>})}</div>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><a href="#pricing"><Button size="lg" className="h-14 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 text-base shadow-xl shadow-violet-900/30">Start automating <ArrowRight className="ml-2 h-5 w-5"/></Button></a><a href="#how"><Button size="lg" variant="outline" className="h-14 rounded-xl border-white/15 bg-white/[.03] px-7 text-base text-white hover:bg-white/10 hover:text-white"><CirclePlay className="mr-2 h-5 w-5"/> See how it works</Button></a></div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400"/> No coding required</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400"/> Start with your business data</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400"/> Human takeover anytime</span></div>
          </div>
          <div className="relative"><div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-violet-600/20 via-fuchsia-500/10 to-cyan-500/15 blur-3xl"/><div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1124] p-2 shadow-2xl shadow-black/60"><img src="/landing-hero.svg" alt="AgentHub AI business automation dashboard" className="w-full rounded-[22px]"/><div className="absolute bottom-7 left-7 rounded-2xl border border-white/10 bg-[#0b1124]/90 px-4 py-3 shadow-xl backdrop-blur"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15"><Zap className="h-5 w-5 text-emerald-300"/></span><div><p className="text-xs font-semibold">AI workforce active</p><p className="text-[10px] text-slate-400">Leads • bookings • follow-ups</p></div></div></div></div></div>
        </div>
      </section>

      <section id="solutions" className="border-b border-white/5 bg-[#080d1d] py-16"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">One platform. One customer journey.</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">From first message to paid customer.</h2><p className="mt-5 text-lg leading-8 text-slate-400">AgentHub connects the steps that usually get lost between your inbox, sales team and follow-up list.</p></div><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[['1','Customer messages','Answer questions instantly across your channels.'],['2','AI understands','Use your knowledge, products and approved pricing.'],['3','AI takes action','Capture leads, book appointments and follow up.'],['4','Your team steps in','Take over whenever a human touch is needed.']].map(([n,t,d])=><div key={n} className="rounded-2xl border border-white/10 bg-white/[.025] p-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-sm font-bold text-violet-200">{n}</div><h3 className="mt-5 font-semibold">{t}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{d}</p></div>)}</div></div></section>

      <section id="features" className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[.2em] text-violet-300">Everything your business needs</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Not just a chatbot. A business operator.</h2><p className="mt-5 text-lg leading-8 text-slate-400">Give the AI the information and controls it needs to help your business respond, sell and retain customers.</p></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([Icon,title,description])=><div key={title as string} className="group rounded-2xl border border-white/10 bg-white/[.025] p-6 transition hover:-translate-y-1 hover:border-violet-400/30 hover:bg-violet-500/[.04]"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/10"><Icon className="h-5 w-5 text-violet-200"/></div><h3 className="mt-5 text-base font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{description as string}</p></div>)}</div></div></section>

      <section id="voice" className="border-y border-white/5 bg-[#080d1d] py-20"><div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8"><div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1124] p-2"><img src="/landing-voice.svg" alt="AgentHub natural AI voice replies" className="w-full rounded-2xl"/></div><div><Badge className="border border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200 hover:bg-fuchsia-400/10"><Volume2 className="mr-2 h-4 w-4"/> Voice AI</Badge><h2 className="mt-5 text-3xl font-bold sm:text-5xl">Talk to customers like a real business.</h2><p className="mt-5 text-lg leading-8 text-slate-400">AgentHub supports text and natural AI voice replies, including English, Urdu and Roman Urdu conversations. Choose when the agent speaks and when it stays in text.</p><div className="mt-7 grid gap-3 sm:grid-cols-2">{['Text only','Voice only','Text + voice','Random delivery'].map((item)=><div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4"><Check className="h-4 w-4 text-emerald-400"/><span className="text-sm">{item}</span></div>)}</div></div></div></section>

      <section id="how" className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Simple setup</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Start in three steps.</h2><p className="mt-5 text-lg leading-8 text-slate-400">You do not need to be technical. Tell AgentHub what your business sells and how you want customers handled.</p><a href="#pricing" className="mt-7 inline-flex items-center text-sm font-semibold text-violet-300 hover:text-violet-200">Choose a plan <ChevronRight className="ml-1 h-4 w-4"/></a></div><div className="grid gap-4 md:grid-cols-3">{[['01','Connect','Connect WhatsApp, Instagram, Facebook or your website chat.'],['02','Teach','Add your business knowledge, products, services, pricing and welcome message.'],['03','Automate','Turn on your AI agent, follow-ups, appointments and customer workflows.']].map(([n,t,d])=><div key={n} className="rounded-2xl border border-white/10 bg-[#0b1124] p-6"><div className="text-xs font-bold text-violet-300">{n}</div><h3 className="mt-6 text-lg font-semibold">{t}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{d}</p></div>)}</div></div></div></section>

      <section className="border-y border-white/5 bg-[#080d1d] py-16"><div className="mx-auto max-w-5xl px-4 sm:px-6"><div className="grid gap-4 md:grid-cols-2">{outcomes.map(([heading,a,b,c,d], index)=><div key={heading} className={`rounded-3xl border p-7 ${index===1?'border-violet-400/30 bg-gradient-to-br from-violet-500/10 to-cyan-500/5':'border-white/10 bg-white/[.02]'}`}><p className={`text-sm font-semibold ${index===1?'text-violet-200':'text-slate-400'}`}>{heading}</p><div className="mt-6 space-y-4">{[a,b,c,d].map((x)=><div key={x} className="flex items-center gap-3 text-sm"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${index===1?'bg-emerald-500/15':'bg-red-500/10'}`}><Check className={`h-4 w-4 ${index===1?'text-emerald-400':'text-slate-500'}`}/></span>{x}</div>)}</div></div>)}</div></div></section>

      <section id="pricing" className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-violet-300">Simple pricing</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Pick the plan that fits your business.</h2><p className="mt-5 text-lg leading-8 text-slate-400">Start with what you need today. Upgrade as your conversations, customers and automation grow.</p><div className="mt-8 inline-flex rounded-xl border border-white/10 bg-white/[.03] p-1"><button onClick={()=>setBillingCycle('monthly')} className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${billingCycle==='monthly'?'bg-white text-slate-900':'text-slate-300'}`}>Monthly</button><button onClick={()=>setBillingCycle('yearly')} className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${billingCycle==='yearly'?'bg-white text-slate-900':'text-slate-300'}`}>Yearly · save more</button></div></div>
        {!plansLoaded ? <div className="mt-12 rounded-2xl border border-white/10 bg-white/[.025] p-10 text-center text-slate-400">Loading plans…</div> : displayPlans.length === 0 ? <div className="mt-12 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8 text-center"><p className="font-semibold">Plans are temporarily unavailable.</p><p className="mt-2 text-sm text-slate-400">Please refresh in a moment or contact AgentHub.</p></div> : <div className="mt-12 grid gap-5 lg:grid-cols-3">{displayPlans.map((plan,index)=>{const discount=annualDiscount(plan.slug);const monthly=Number(plan.price_cents)/100;const yearly=monthly*12*(1-discount/100);const price=billingCycle==='yearly'?yearly:monthly;return <div key={plan.slug} className={`relative flex flex-col rounded-3xl border p-7 ${index===1?'border-violet-400/50 bg-gradient-to-b from-violet-500/10 to-white/[.02] shadow-2xl shadow-violet-900/20':'border-white/10 bg-white/[.025]'}`}>{index===1&&<div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-4 py-1 text-[10px] font-bold uppercase tracking-wider">Most popular</div>}<p className="text-sm font-semibold text-violet-200">{plan.name}</p><p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">{plan.description || 'AI customer automation for your business.'}</p><div className="mt-6 flex items-end gap-1"><span className="text-5xl font-bold">${price.toFixed(0)}</span><span className="mb-2 text-sm text-slate-500">/{billingCycle==='yearly'?'year':'month'}</span></div>{billingCycle==='yearly'&&<p className="mt-2 text-xs font-semibold text-emerald-300">Save {discount}% with yearly billing</p>}<ul className="mt-7 flex-1 space-y-3">{plan.features.slice(0,8).map((feature)=><li key={feature} className="flex gap-2 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"/>{feature}</li>)}</ul><Link href={`/checkout?plan=${encodeURIComponent(plan.slug)}&cycle=${billingCycle}`} className="mt-8"><Button className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600">Choose {plan.name} <ArrowRight className="ml-2 h-4 w-4"/></Button></Link><p className="mt-3 text-center text-[11px] text-slate-500">Pakistan: Easypaisa • JazzCash • Bank Transfer</p></div>})}</div>}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-slate-500"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/> Secure checkout</span><span className="flex items-center gap-2"><Phone className="h-4 w-4"/> WhatsApp support</span><span className="flex items-center gap-2"><Clock3 className="h-4 w-4"/> 10-day payment grace period</span></div>
      </div></section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-600/15 via-indigo-600/10 to-cyan-500/10 p-8 text-center sm:p-12"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-200">Ready to automate?</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Let your team focus on customers. Let AgentHub handle the routine.</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300">Start with one plan, connect your channels, add your business knowledge and let your AI workforce take care of the repetitive customer work.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><a href="#pricing"><Button size="lg" className="h-13 rounded-xl bg-white px-8 text-slate-900 hover:bg-slate-100">View plans <ArrowRight className="ml-2 h-5 w-5"/></Button></a><Link href="/login"><Button size="lg" variant="outline" className="h-13 rounded-xl border-white/20 text-white hover:bg-white/10 hover:text-white">Sign in</Button></Link></div></div></section>

      <footer className="border-t border-white/10 py-10"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div className="flex items-center gap-3"><img src="/agenthub-logo.svg" alt="AgentHub AI" className="h-8 w-8 rounded-lg"/><span>© 2026 AgentHub AI. Automate • Connect • Grow.</span></div><div className="flex gap-5"><a href="#features" className="hover:text-white">Features</a><a href="#pricing" className="hover:text-white">Pricing</a><Link href="/login" className="hover:text-white">Sign in</Link></div></div></footer>
    </main>
  );
}
