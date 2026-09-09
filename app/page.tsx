'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SubscriptionPlan } from '@/lib/types/database';
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Database,
  Facebook,
  Globe2,
  Headphones,
  Instagram,
  LayoutDashboard,
  MessageCircle,
  Mic2,
  Phone,
  ReceiptText,
  Repeat2,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  Workflow,
  Zap,
} from 'lucide-react';

const channels = [
  { name: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500', text: 'Voice + text' },
  { name: 'Instagram', icon: Instagram, color: 'bg-fuchsia-500', text: 'DM automation' },
  { name: 'Facebook', icon: Facebook, color: 'bg-blue-600', text: 'Messenger' },
  { name: 'Website Chat', icon: Globe2, color: 'bg-violet-600', text: '24/7 widget' },
];

const featureCards = [
  [Bot, 'Business-trained AI', 'Teach the agent with your own knowledge, services, products and pricing so conversations stay aligned with your business.'],
  [Mic2, 'Natural AI voice replies', 'Reply with text, voice, text + voice or randomized delivery. Voice conversations can follow the customer language and style.'],
  [Headphones, 'Voice Studio & cloning', 'Manage voice providers and optional cloned voices from the dashboard, with fallback voice support when a clone is unavailable.'],
  [Repeat2, 'Follow-up automation', 'Keep leads moving with scheduled follow-ups, reminders and automated customer re-engagement instead of letting conversations go cold.'],
  [Users, 'Human takeover', 'Your team can take control of a conversation. AgentHub respects human mode so the AI does not continue replying over your staff.'],
  [ReceiptText, 'Automatic payment receipts', 'Payments can trigger customer-facing receipt delivery so customers do not need to ask for their receipt manually.'],
  [Database, 'Products & pricing', 'Maintain products, services and approved pricing so the AI can answer commercial questions from your business data.'],
  [CalendarCheck, 'Leads & appointments', 'Capture customer details, organize leads and move qualified conversations toward appointments and bookings.'],
  [LayoutDashboard, 'One business dashboard', 'Manage conversations, agents, integrations, AI providers, voice settings, follow-ups and business settings from one workspace.'],
  [Workflow, 'Multiple AI agents', 'Create agents for different jobs or business workflows and configure their behavior from the AgentHub dashboard.'],
  [Zap, 'Custom welcome messages', 'Give every business its own welcome message and brand voice instead of starting every customer conversation the same way.'],
  [ShieldCheck, 'Controlled automation', 'Set channel rules, language behavior, AI settings and human intervention controls while keeping the business in charge.'],
];

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
      .catch((error) => {
        console.error('[Pricing] Unable to load public plans:', error);
        if (active) setPlans([]);
      })
      .finally(() => {
        if (active) setPlansLoaded(true);
      });
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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src="/agenthub-logo.svg" alt="AgentHub AI" className="h-11 w-11 rounded-xl object-cover shadow-lg shadow-violet-500/25" />
            <div className="leading-none">
              <div className="text-[17px] font-bold tracking-tight">AgentHub<span className="text-cyan-400"> AI</span></div>
              <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.28em] text-slate-500">Automate • Connect • Grow</div>
            </div>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
            <a href="#channels" className="transition hover:text-white">Channels</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#voice" className="transition hover:text-white">Voice AI</a>
            <a href="#how-it-works" className="transition hover:text-white">How it works</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="hidden text-sm text-slate-300 hover:text-white sm:block">Sign in</Link>
            <a href="#pricing">
              <Button size="sm" className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-900/30 hover:from-violet-500 hover:to-indigo-500">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[45%] top-[-180px] h-[650px] w-[650px] rounded-full bg-violet-600/20 blur-[150px]" />
          <div className="absolute right-[-100px] top-[260px] h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[130px]" />
          <div className="absolute left-[-140px] bottom-[-120px] h-[360px] w-[360px] rounded-full bg-fuchsia-600/10 blur-[120px]" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-14 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
          <div>
            <Badge className="border border-cyan-400/20 bg-cyan-400/10 px-4 py-1.5 text-cyan-200 hover:bg-cyan-400/10"><Sparkles className="mr-2 h-3.5 w-3.5" /> AI customer operations, built for business</Badge>
            <h1 className="mt-7 max-w-3xl text-5xl font-bold leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-[74px]">Your customers talk.<span className="block bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">AgentHub takes action.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">One AI workspace for customer conversations, sales, leads, appointments, follow-ups and voice replies across WhatsApp, Instagram, Facebook and your website.</p>

            <div className="mt-8 flex flex-wrap gap-2">
              {channels.map((channel) => { const Icon = channel.icon; return (
                <span key={channel.name} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-slate-200 backdrop-blur">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${channel.color}`}><Icon className="h-3.5 w-3.5" /></span>
                  <span><b>{channel.name}</b><span className="ml-1.5 text-slate-500">{channel.text}</span></span>
                </span>
              ); })}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#pricing"><Button size="lg" className="h-14 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 text-base shadow-xl shadow-violet-900/30 hover:from-violet-500 hover:to-indigo-500">Start automating <ArrowRight className="ml-2 h-5 w-5" /></Button></a>
              <a href="#voice"><Button size="lg" variant="outline" className="h-14 rounded-xl border-white/15 bg-white/[0.03] px-7 text-base text-white hover:bg-white/10 hover:text-white"><CirclePlay className="mr-2 h-5 w-5" /> Explore Voice AI</Button></a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> No coding required</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Business knowledge + products</span>
              <span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Human takeover</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-8 rounded-[44px] bg-gradient-to-br from-violet-600/25 via-fuchsia-500/10 to-cyan-500/20 blur-3xl" />
            <div className="relative rounded-[30px] border border-white/10 bg-[#0b1124]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <div className="overflow-hidden rounded-[23px] border border-white/10 bg-[#070d1d]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
                  <div className="flex items-center gap-2.5"><img src="/agenthub-logo.svg" alt="AgentHub" className="h-9 w-9 rounded-lg object-cover" /><div><p className="text-sm font-semibold">AgentHub AI</p><p className="text-[10px] text-emerald-400">● AI workforce online</p></div></div>
                  <Badge className="bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10">24/7 Active</Badge>
                </div>
                <div className="grid min-h-[510px] grid-cols-[88px_1fr] sm:grid-cols-[142px_1fr]">
                  <aside className="border-r border-white/10 p-2 sm:p-3">
                    {['Overview','Inbox','Leads','Bookings','Follow-ups','Voice AI','Knowledge','Products'].map((item, i) => <div key={item} className={`mb-1 rounded-lg px-2 py-2.5 text-[9px] sm:px-3 sm:text-[11px] ${i === 1 ? 'bg-violet-600/25 text-white' : 'text-slate-500'}`}>{item}</div>)}
                  </aside>
                  <div className="min-w-0 p-3 sm:p-5">
                    <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] text-slate-500">Unified customer inbox</p><h2 className="text-base font-semibold">Live conversations</h2></div><div className="flex -space-x-1">{channels.map((c) => { const I = c.icon; return <span key={c.name} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#070d1d] ${c.color}`}><I className="h-3 w-3" /></span>; })}</div></div>
                    <div className="grid gap-3 lg:grid-cols-[0.78fr_1.22fr]">
                      <div className="space-y-2">{[['Sarah Ahmed','Instagram','I need details about your plans'],['Michael','Website','Can I book a demo?'],['Ayesha Khan','WhatsApp','What is the price?'],['David Smith','Facebook','Tell me more about this']].map(([name, source, msg], i) => <div key={name} className={`rounded-xl border p-2.5 ${i === 0 ? 'border-violet-500/40 bg-violet-500/10' : 'border-white/10 bg-white/[0.025]'}`}><div className="flex justify-between gap-2"><span className="text-[10px] font-semibold">{name}</span><span className="text-[8px] text-slate-500">{source}</span></div><p className="mt-1 truncate text-[9px] text-slate-400">{msg}</p></div>)}</div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                        <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold">Ayesha Khan</p><p className="text-[9px] text-emerald-300">WhatsApp • Voice enabled</p></div><span className="text-[9px] text-slate-500">now</span></div>
                        <div className="space-y-3 text-[10px]"><div className="max-w-[82%] rounded-xl rounded-tl-sm bg-white/[0.07] p-2.5 text-slate-300">Assalam o Alaikum, mujhy plan aur price bata dein.</div><div className="ml-auto max-w-[88%] rounded-xl rounded-tr-sm bg-violet-600/85 p-2.5">Wa Alaikum Assalam! Bilkul. Main aapko plans aur pricing explain kar deta hoon.</div><div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15"><Volume2 className="h-4 w-4 text-emerald-300" /></div><div className="flex-1"><p className="text-[9px] font-medium text-emerald-200">Voice reply generated</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" /></div></div><span className="text-[8px] text-slate-500">0:08</span></div></div>
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 p-2"><span className="flex-1 text-[9px] text-slate-500">AI is replying in the customer language...</span><Send className="h-3.5 w-3.5 text-violet-300" /></div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><p className="text-[9px] text-slate-500">New leads</p><p className="mt-1 text-sm font-bold">+24</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><p className="text-[9px] text-slate-500">Follow-ups</p><p className="mt-1 text-sm font-bold">18</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-2.5"><p className="text-[9px] text-slate-500">Bookings</p><p className="mt-1 text-sm font-bold">9</p></div></div>
                  </div>
                </div>
              </div>
              <div className="absolute -right-6 top-20 hidden rounded-2xl border border-emerald-400/20 bg-[#10182f]/95 p-3 shadow-xl backdrop-blur sm:block"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15"><Mic2 className="h-5 w-5 text-emerald-300" /></div><div><p className="text-xs font-semibold">Voice reply ready</p><p className="text-[10px] text-slate-400">Customer language detected</p></div></div></div>
              <div className="absolute -left-6 bottom-7 hidden rounded-2xl border border-cyan-400/20 bg-[#10182f]/95 p-3 shadow-xl backdrop-blur sm:block"><div className="flex items-center gap-3"><CalendarCheck className="h-5 w-5 text-cyan-300" /><div><p className="text-xs font-semibold">Appointment booked</p><p className="text-[10px] text-slate-400">Follow-up scheduled automatically</p></div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/5 bg-[#080d1d] py-7">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 sm:px-6 lg:px-8">
          <span>AI Conversations</span><span>•</span><span>Voice Automation</span><span>•</span><span>Lead Capture</span><span>•</span><span>Follow-ups</span><span>•</span><span>Appointments</span><span>•</span><span>Human Handoff</span>
        </div>
      </section>

      <section id="channels" className="border-b border-white/5 bg-[#090f20] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center"><Badge className="bg-white/5 text-slate-300 hover:bg-white/5">ONE WORKSPACE • FOUR CHANNELS</Badge><h2 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">Be everywhere your customers are.</h2><p className="mt-5 text-slate-400">Connect your customer touchpoints to the same AI brain, business knowledge and automation workflow.</p></div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {channels.map(({ name, icon: Icon, color, text }) => <Card key={name} className="group overflow-hidden border-white/10 bg-[#0d1428] text-white transition duration-300 hover:-translate-y-1 hover:border-white/20"><CardContent className="relative p-6"><div className={`absolute right-0 top-0 h-24 w-24 rounded-full ${color} opacity-10 blur-2xl`} /><div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${color} shadow-lg`}><Icon className="h-7 w-7" /></div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{text}</p><h3 className="mt-2 text-xl font-bold">{name}</h3><p className="mt-3 text-sm leading-6 text-slate-400">Automate conversations, capture intent and keep customer history connected to your business workflow.</p><div className="mt-6 text-xs font-semibold text-slate-200">Connect channel <ArrowRight className="ml-1 inline h-3 w-3 transition group-hover:translate-x-1" /></div></CardContent></Card>)}
          </div>
        </div>
      </section>

      <section id="voice" className="relative overflow-hidden border-b border-white/5 py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(139,92,246,0.16),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,0.10),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div>
              <Badge className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/10"><Volume2 className="mr-2 h-3.5 w-3.5" /> VOICE AI</Badge>
              <h2 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">Make the AI sound like part of your business.</h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">AgentHub supports voice-enabled customer conversations, selectable delivery modes and voice-provider controls from the dashboard. Keep text, voice or both depending on how your business wants to communicate.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {['Text only', 'Voice only', 'Text + voice', 'Random delivery'].map((mode) => <div key={mode} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15"><Check className="h-4 w-4 text-violet-300" /></span><span className="text-sm font-medium">{mode}</span></div>)}
              </div>
              <div className="mt-7 flex flex-wrap gap-3 text-xs text-slate-400"><span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">Multilingual replies</span><span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">Voice provider controls</span><span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">Optional cloned voice</span></div>
            </div>
            <div className="relative rounded-[28px] border border-white/10 bg-[#0b1124] p-5 shadow-2xl shadow-black/40 sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500"><Mic2 className="h-5 w-5" /></div><div><p className="font-semibold">AgentHub Voice Studio</p><p className="text-xs text-slate-500">Voice response pipeline</p></div></div><span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-300">READY</span></div>
              <div className="mt-6 space-y-3"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">Customer language</span><span className="text-xs font-semibold text-cyan-300">Roman Urdu + English</span></div><div className="mt-3 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[82%] rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" /></div><span className="text-[10px] text-slate-500">detected</span></div></div><div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4"><div className="flex items-center gap-3"><Volume2 className="h-5 w-5 text-emerald-300" /><div className="flex-1"><p className="text-xs font-semibold">Voice response</p><p className="mt-1 text-[10px] text-slate-500">Clear response generated for WhatsApp</p></div><span className="text-xs text-slate-500">0:08</span></div><div className="mt-4 flex items-center gap-1">{Array.from({ length: 34 }).map((_, i) => <span key={i} className="w-1 rounded-full bg-emerald-400/70" style={{ height: `${8 + ((i * 17) % 20)}px` }} />)}</div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Fallback</p><p className="mt-2 text-sm font-semibold">AI voice</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Channel</p><p className="mt-2 text-sm font-semibold">WhatsApp</p></div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-[#090f20] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center"><Badge className="bg-violet-500/10 text-violet-200 hover:bg-violet-500/10">THE AGENTHUB DIFFERENCE</Badge><h2 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">More than a chatbot.</h2><p className="mt-5 text-lg leading-8 text-slate-400">The newest AgentHub capabilities connect AI conversations to the real work your business needs done.</p></div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{featureCards.map(([Icon, title, desc]) => { const I = Icon as typeof Bot; return <div key={title as string} className="group rounded-2xl border border-white/10 bg-[#0c1327] p-6 transition duration-300 hover:-translate-y-1 hover:border-violet-500/30 hover:bg-[#101830]"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300 group-hover:bg-violet-500/15"><I className="h-5 w-5" /></div><h3 className="mt-5 font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{desc as string}</p></div>; })}</div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-white/5 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center"><Badge className="bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/10">HOW IT WORKS</Badge><h2 className="mt-5 text-4xl font-bold sm:text-5xl">Connect once. Automate continuously.</h2></div>
          <div className="relative mt-14 grid gap-5 md:grid-cols-4">
            {[['01','Choose your plan','Pick the AgentHub package that matches your business, agents and channels.'],['02','Build your AI workforce','Create agents, add your knowledge, products, pricing and business rules.'],['03','Connect conversations','Connect WhatsApp, Instagram, Facebook and your website chat as available.'],['04','Let AgentHub act','Answer, speak, qualify, follow up, book appointments and hand conversations to humans when needed.']].map(([number, title, desc], index) => <div key={number} className="relative rounded-2xl border border-white/10 bg-[#0b1224] p-6"><span className="text-5xl font-bold text-violet-500/20">{number}</span><div className="mt-6 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-400" /><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step {index + 1}</span></div><h3 className="mt-3 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{desc}</p></div>)}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-600/15 to-transparent p-7"><BarChart3 className="h-6 w-6 text-violet-300" /><h3 className="mt-5 text-xl font-semibold">Conversation → revenue</h3><p className="mt-2 text-sm leading-6 text-slate-400">Capture the lead, answer the question, schedule the appointment and keep the relationship moving.</p></div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-600/10 to-transparent p-7"><Clock3 className="h-6 w-6 text-cyan-300" /><h3 className="mt-5 text-xl font-semibold">Always on</h3><p className="mt-2 text-sm leading-6 text-slate-400">Your AI workforce keeps responding when your team is busy, offline or asleep.</p></div>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-600/10 to-transparent p-7"><ShieldCheck className="h-6 w-6 text-emerald-300" /><h3 className="mt-5 text-xl font-semibold">Business control</h3><p className="mt-2 text-sm leading-6 text-slate-400">Your team controls AI behavior, knowledge, voice, channels, follow-ups and human takeover.</p></div>
          </div>
        </div>
      </section>

      <section id="pricing" className="border-y border-white/5 bg-[#090f20] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center"><Badge className="bg-violet-500/10 text-violet-200 hover:bg-violet-500/10">PRICING</Badge><h2 className="mt-5 text-4xl font-bold sm:text-5xl">Choose your AI workforce.</h2><p className="mt-5 text-slate-400">Start with the plan that fits your business and scale your automation as your customer conversations grow.</p></div>
          <div className="mx-auto mt-8 flex w-fit rounded-2xl border border-white/10 bg-white/[0.04] p-1"><button onClick={() => setBillingCycle('monthly')} className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${billingCycle === 'monthly' ? 'bg-white text-[#0b1020]' : 'text-slate-400 hover:text-white'}`}>Monthly</button><button onClick={() => setBillingCycle('yearly')} className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${billingCycle === 'yearly' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>Yearly <span className="ml-1 text-xs text-violet-200">Save up to 10%</span></button></div>
          {!plansLoaded ? <div className="py-12 text-center text-slate-400">Loading plans...</div> : plans.length > 0 ? <div className="mt-10 grid gap-6 md:grid-cols-3 md:items-start">{plans.map((plan) => { const popular = plan.slug === 'professional'; const discount = plan.slug === 'enterprise' ? 10 : plan.slug === 'starter' ? 4 : 7; const monthlyCents = Number(plan.price_cents); const yearlyCents = Math.round(monthlyCents * 12 * (1 - discount / 100)); const displayCents = billingCycle === 'yearly' ? yearlyCents : monthlyCents; const price = (displayCents / 100).toFixed(0); return <Card key={plan.id} className={`relative overflow-hidden border ${popular ? 'border-violet-500 shadow-2xl shadow-violet-500/10' : 'border-white/10'} bg-[#0d1428] text-white`}>{popular && <div className="bg-gradient-to-r from-violet-600 to-indigo-600 py-2 text-center text-xs font-semibold">MOST POPULAR</div>}<CardContent className="p-7"><h3 className="text-2xl font-bold">{plan.name}</h3><p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-400">{plan.description || 'Flexible AI automation for your business.'}</p><div className="mt-7 flex items-end gap-1"><span className="text-5xl font-bold">${price}</span><span className="mb-2 text-sm text-slate-500">/{billingCycle === 'yearly' ? 'year' : 'month'}</span></div><div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-300"><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_agents >= 999 ? 'Unlimited' : plan.max_agents} AI agents</span><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_team_members >= 999 ? 'Unlimited' : plan.max_team_members} team members</span><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_integrations >= 999 ? 'Unlimited' : plan.max_integrations} integrations</span><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_ai_usage_per_month ? plan.max_ai_usage_per_month.toLocaleString() : 'Custom'} AI usage</span></div><ul className="mt-6 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{feature}</li>)}</ul><Link href={`/checkout?plan=${encodeURIComponent(plan.slug)}&cycle=${billingCycle}`} className="mt-8 block"><Button className={`w-full rounded-xl ${popular ? 'bg-violet-600 hover:bg-violet-500' : 'bg-white/10 hover:bg-white/15'}`}>Choose {plan.name} <ArrowRight className="ml-2 h-4 w-4" /></Button></Link></CardContent></Card>; })}</div> : <div className="py-12 text-center text-slate-400">Plans are temporarily unavailable. Please contact us to get started.</div>}
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"><div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-violet-600/20 via-[#10172d] to-cyan-500/10 p-8 text-center sm:p-14"><div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" /><img src="/agenthub-logo.svg" alt="AgentHub AI" className="relative mx-auto h-20 w-20 rounded-2xl object-cover shadow-2xl shadow-violet-900/40" /><h2 className="relative mt-7 text-4xl font-bold sm:text-5xl">Ready to put your customer conversations to work?</h2><p className="relative mx-auto mt-5 max-w-2xl text-slate-300">Start with AgentHub and bring AI conversations, voice replies, follow-ups, leads and appointments into one business system.</p><div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row"><a href="#pricing"><Button size="lg" className="h-13 rounded-xl bg-violet-600 px-7 hover:bg-violet-500">View plans <ArrowRight className="ml-2 h-5 w-5" /></Button></a><a href="https://wa.me/923407465567" target="_blank" rel="noreferrer"><Button size="lg" variant="outline" className="h-13 rounded-xl border-white/15 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white"><MessageCircle className="mr-2 h-5 w-5 text-emerald-400" /> WhatsApp us</Button></a></div></div></div>
      </section>

      <footer className="border-t border-white/10 bg-[#040611] py-9 text-sm text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><img src="/agenthub-logo.svg" alt="AgentHub AI" className="h-9 w-9 rounded-lg object-cover" /><div><span className="font-semibold text-slate-300">AgentHub AI</span><p className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Automate • Connect • Grow</p></div></div>
          <div className="flex flex-wrap gap-5"><a href="#channels" className="hover:text-white">Channels</a><a href="#features" className="hover:text-white">Features</a><a href="#voice" className="hover:text-white">Voice AI</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="https://wa.me/923407465567" target="_blank" rel="noreferrer" className="hover:text-white">+92 340 7465567</a></div>
          <span>Turn conversations into business actions.</span>
        </div>
      </footer>
    </main>
  );
}
