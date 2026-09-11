'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SubscriptionPlan } from '@/lib/types/database';
import { ArrowRight, Bot, CalendarCheck, Check, ChevronRight, CirclePlay, Clock3, Database, Facebook, Globe2, HandCoins, Instagram, MessageCircle, Mic2, Phone, ReceiptText, Repeat2, ShieldCheck, Sparkles, Users, Volume2, Workflow, Zap } from 'lucide-react';

const channels = [
  { name: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500', description: 'Chat, voice & sales' },
  { name: 'Instagram', icon: Instagram, color: 'bg-fuchsia-500', description: 'DM automation' },
  { name: 'Facebook', icon: Facebook, color: 'bg-blue-600', description: 'Messenger replies' },
  { name: 'Website', icon: Globe2, color: 'bg-violet-600', description: '24/7 website chat' },
];

const industries = [
  ['Pharmacies', '/ai-for-pharmacies', 'Answer product enquiries, capture leads and route sensitive prescription questions to staff.'],
  ['Clinics', '/ai-for-clinics', 'Handle routine patient enquiries, appointment requests and follow-ups around the clock.'],
  ['Real Estate', '/ai-for-real-estate', 'Qualify property enquiries, collect requirements and keep prospects moving with follow-ups.'],
  ['Restaurants', '/ai-for-restaurants', 'Automate menu, service and booking enquiries while your team focuses on customers.'],
  ['E-commerce', '/ai-for-ecommerce', 'Answer product questions, recover interested shoppers and automate customer conversations.'],
  ['Salons', '/ai-for-salons', 'Turn service enquiries into appointments with automated responses and follow-ups.'],
  ['Education', '/ai-for-education', 'Answer course and admissions questions, capture prospective students and follow up.'],
] as const;

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

function limitText(value: number | null, label: string) {
  if (value === null) return `Unlimited ${label}`;
  return `${value.toLocaleString()} ${label}`;
}

function planFeatureList(plan: SubscriptionPlan) {
  const configured = Array.isArray(plan.features) ? plan.features.filter(Boolean).slice(0, 6) : [];
  const limits = [
    `${plan.max_agents} AI agent${plan.max_agents === 1 ? '' : 's'}`,
    limitText(plan.max_conversations, 'conversations/month'),
    `${plan.max_team_members} team member${plan.max_team_members === 1 ? '' : 's'}`,
    `${plan.max_leads.toLocaleString()} leads`,
    `${plan.max_appointments.toLocaleString()} appointments`,
    `${plan.max_products.toLocaleString()} products`,
  ];
  return [...configured, ...limits].slice(0, 8);
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
    const order = ['starter', 'professional', 'enterprise'];
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
          <Link href="/" className="flex items-center gap-3"><img src="/agenthub-logo.svg" alt="AgentHub AI" className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-violet-500/25" /><div className="leading-none"><div className="text-[17px] font-bold">AgentHub<span className="text-cyan-400"> AI</span></div><div className="mt-1 text-[9px] uppercase tracking-[0.28em] text-slate-500">Automate • Connect • Grow</div></div></Link>
          <div className="hidden items-center gap-7 text-sm text-slate-300 lg:flex"><a href="#solutions" className="hover:text-white">Solutions</a><a href="#features" className="hover:text-white">Features</a><a href="#voice" className="hover:text-white">Voice AI</a><a href="#how" className="hover:text-white">How it works</a><a href="#pricing" className="hover:text-white">Pricing</a></div>
          <div className="flex items-center gap-2 sm:gap-4"><Link href="/login" className="hidden text-sm text-slate-300 hover:text-cyan-300 sm:block">Sign in</Link><a href="#pricing"><Button size="sm" className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-900/30">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button></a></div>
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
          <div className="relative"><div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-violet-600/20 via-fuchsia-500/10 to-cyan-500/15 blur-3xl"/><div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white p-2 shadow-2xl shadow-black/60"><img src="/landing-hero.svg?v=bright-agenthub-2" alt="AgentHub AI shows WhatsApp, Instagram, Facebook and Website automation, AI conversations, lead capture, appointments and automatic follow-ups" className="w-full rounded-[22px]"/></div></div>
        </div>
      </section>

      <section id="solutions" className="border-b border-white/5 bg-[#080d1d] py-16"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">One platform. One customer journey.</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">From first message to paid customer.</h2><p className="mt-5 text-lg leading-8 text-slate-400">AgentHub connects the steps that usually get lost between your inbox, sales team and follow-up list.</p></div><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[['1','Customer messages','Answer questions instantly across your channels.'],['2','AI understands','Use your knowledge, products and approved pricing.'],['3','AI takes action','Capture leads, book appointments and follow up.'],['4','Your team steps in','Take over whenever a human touch is needed.']].map(([n,t,d])=><div key={n} className="rounded-2xl border border-white/10 bg-white/[.025] p-6"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-sm font-bold text-violet-200">{n}</div><h3 className="mt-5 font-semibold">{t}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{d}</p></div>)}</div></div></section>

      <section id="features" className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[.2em] text-violet-300">Everything your business needs</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Not just a chatbot. A business operator.</h2><p className="mt-5 text-lg leading-8 text-slate-400">Give the AI the information and controls it needs to help your business respond, sell and retain customers.</p></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([Icon,title,description])=><div key={title as string} className="group rounded-2xl border border-white/10 bg-white/[.025] p-6 transition hover:-translate-y-1 hover:border-violet-400/30 hover:bg-violet-500/[.04]"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/10"><Icon className="h-5 w-5 text-violet-200"/></div><h3 className="mt-5 text-base font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{description as string}</p></div>)}</div></div></section>

      <section id="voice" className="border-y border-white/5 bg-[#080d1d] py-20"><div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8"><div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1124] p-2"><img src="/landing-voice.svg" alt="AgentHub natural AI voice" className="w-full rounded-2xl"/></div><div><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Voice AI</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Let customers talk to your business.</h2><p className="mt-5 text-lg leading-8 text-slate-400">AgentHub can respond with text or voice and adapt to English, Urdu and Roman Urdu conversations.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><Volume2 className="h-5 w-5 text-cyan-300"/><p className="mt-3 font-semibold">Natural voice replies</p><p className="mt-1 text-sm text-slate-400">Voice when the customer needs it.</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><Phone className="h-5 w-5 text-emerald-300"/><p className="mt-3 font-semibold">WhatsApp ready</p><p className="mt-1 text-sm text-slate-400">Designed around real customer conversations.</p></div></div></div></div></section>

      <section id="how" className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-violet-300">How it works</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Connect once. Let the agent work.</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3"><div className="rounded-3xl border border-white/10 bg-white/[.025] p-7"><div className="text-3xl font-bold text-violet-300">01</div><h3 className="mt-5 text-xl font-semibold">Connect your channels</h3><p className="mt-3 leading-7 text-slate-400">Connect WhatsApp, Instagram, Facebook and your website chat.</p></div><div className="rounded-3xl border border-white/10 bg-white/[.025] p-7"><div className="text-3xl font-bold text-cyan-300">02</div><h3 className="mt-5 text-xl font-semibold">Give it your business knowledge</h3><p className="mt-3 leading-7 text-slate-400">Add products, services, prices, FAQs and your preferred customer tone.</p></div><div className="rounded-3xl border border-white/10 bg-white/[.025] p-7"><div className="text-3xl font-bold text-emerald-300">03</div><h3 className="mt-5 text-xl font-semibold">Let it take action</h3><p className="mt-3 leading-7 text-slate-400">The agent replies, captures leads, books appointments and follows up automatically.</p></div></div></div></section>

      <section className="border-y border-white/5 bg-[#080d1d] py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="grid gap-5 lg:grid-cols-2">{outcomes.map((group,index)=><div key={group[0]} className={`rounded-3xl border p-7 ${index===1?'border-emerald-400/20 bg-emerald-400/[.04]':'border-white/10 bg-white/[.025]'}`}><h3 className="text-xl font-bold">{group[0]}</h3><div className="mt-6 grid gap-3">{group.slice(1).map(item=><div key={item} className="flex items-center gap-3 text-slate-300"><Check className={`h-4 w-4 ${index===1?'text-emerald-400':'text-slate-500'}`}/>{item}</div>)}</div></div>)}</div></div></section>

      <section id="industries" className="border-y border-white/5 bg-[#080d1d] py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">AI automation by industry</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Built around how your industry actually works.</h2><p className="mt-5 text-lg leading-8 text-slate-400">Explore practical AgentHub workflows for the businesses that receive customer enquiries every day.</p></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{industries.map(([name,href,description])=><Link key={href} href={href} className="group rounded-2xl border border-white/10 bg-white/[.025] p-6 transition hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-cyan-400/[.04]"><div className="flex items-center justify-between"><h3 className="font-semibold text-white">AI for {name}</h3><ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-300"/></div><p className="mt-3 text-sm leading-6 text-slate-400">{description}</p><span className="mt-5 inline-block text-xs font-semibold text-cyan-300">Explore solution →</span></Link>)}</div></div></section>

      <section id="pricing" className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Simple pricing</p><h2 className="mt-3 text-3xl font-bold sm:text-5xl">Choose the automation level you need.</h2><p className="mt-5 text-lg text-slate-400">Same plans, clear limits — upgrade when you need more automation.</p><div className="mx-auto mt-7 inline-flex rounded-full border border-white/10 bg-white/[.04] p-1"><button onClick={()=>setBillingCycle('monthly')} className={`rounded-full px-5 py-2 text-sm ${billingCycle==='monthly'?'bg-white text-slate-900':'text-slate-300'}`}>Monthly</button><button onClick={()=>setBillingCycle('yearly')} className={`rounded-full px-5 py-2 text-sm ${billingCycle==='yearly'?'bg-white text-slate-900':'text-slate-300'}`}>Yearly</button></div></div><div className="mt-12 grid gap-5 lg:grid-cols-3">{plansLoaded && displayPlans.map((plan,index)=>{const discount=annualDiscount(plan.slug); const monthly=Number(plan.price_cents ?? 0)/100; const yearly=Number(plan.yearly_price_cents ?? monthly*12*(1-discount/100))/100; const price=billingCycle==='yearly'?yearly:monthly; const planFeatures=planFeatureList(plan); return <div key={plan.id} className={`relative flex h-full flex-col rounded-3xl border p-7 ${index===1?'border-violet-400/35 bg-gradient-to-b from-violet-500/[.12] to-white/[.025] shadow-xl shadow-violet-950/20':'border-white/10 bg-white/[.025]'}`}>{index===1&&<div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-violet-400/30 bg-violet-500/20 px-3 py-1 text-[11px] font-semibold text-violet-200">Most popular</div>}<div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold">{plan.name}</h3>{plan.description&&<p className="mt-2 text-sm leading-6 text-slate-400">{plan.description}</p>}</div>{billingCycle==='yearly'&&<span className="shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">Save {discount}%</span>}</div><div className="mt-7 flex items-end gap-1"><span className="text-4xl font-bold">{plan.currency || 'PKR'} {price.toLocaleString()}</span><span className="pb-1 text-slate-500">/{billingCycle==='yearly'?'year':'month'}</span></div><div className="mt-6 border-t border-white/10 pt-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Included in this plan</p><div className="mt-4 grid gap-3">{planFeatures.map((feature,featureIndex)=><div key={`${plan.id}-${featureIndex}`} className="flex items-start gap-2 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"/><span>{feature}</span></div>)}</div></div><Link className="mt-7" href={`/checkout?plan=${plan.slug}&cycle=${billingCycle}`}><Button className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600">Choose {plan.name}<ChevronRight className="ml-2 h-4 w-4"/></Button></Link></div>})}</div>{plansLoaded&&displayPlans.length===0&&<div className="mx-auto mt-10 max-w-xl rounded-2xl border border-white/10 bg-white/[.025] p-6 text-center text-sm text-slate-400">Pricing is temporarily unavailable. Please try again shortly.</div>}</div></section>

      <footer className="border-t border-white/10 py-10"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8"><div>© {new Date().getFullYear()} AgentHub AI. Automate • Connect • Grow.</div><div className="flex flex-wrap items-center gap-5"><Link href="/login" className="hover:text-cyan-300">Sign in</Link><a href="#pricing" className="hover:text-white">Pricing</a><a href="https://wa.me/923407465567?text=Hi%20AgentHub%20AI%2C%20I%27d%20like%20to%20ask%20a%20query%20or%20book%20a%20demo." target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-emerald-400 transition hover:text-emerald-300"><MessageCircle className="h-4 w-4"/> WhatsApp: Query / Book Demo</a></div></div></footer>
    </main>
  );
}
