
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SubscriptionPlan } from '@/lib/types/database';
import {
  ArrowRight, Bot, Check, ChevronRight, CirclePlay, Clock3, Facebook, Globe2,
  Instagram, LayoutDashboard, MessageCircle, Phone, Send, ShieldCheck, Users,
  Sparkles, Zap, CalendarCheck, Database, BarChart3, Repeat2, Workflow
} from 'lucide-react';

const channels = [
  { name: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500' },
  { name: 'Instagram', icon: Instagram, color: 'bg-pink-500' },
  { name: 'Facebook', icon: Facebook, color: 'bg-blue-600' },
  { name: 'Website Chat', icon: Globe2, color: 'bg-violet-600' },
];

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);

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
    if (document.getElementById(scriptId)) return;
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `${window.location.origin}/widget-js?business=11f62525-3c27-474d-854e-e474c7211d43`;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#070b18] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#070b18]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-17 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30"><Bot className="h-5 w-5" /></div>
            <span className="text-lg font-bold tracking-tight">AgentHub AI</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-slate-300 lg:flex">
            <a href="#channels" className="hover:text-white">Channels</a><a href="#features" className="hover:text-white">Features</a><a href="#how-it-works" className="hover:text-white">How it works</a><a href="#pricing" className="hover:text-white">Pricing</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-4"><Link href="/login" className="hidden text-sm text-slate-300 hover:text-white sm:block">Sign in</Link><a href="#pricing"><Button size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-500">Start with AgentHub <ArrowRight className="ml-2 h-4 w-4" /></Button></a></div>
        </div>
      </nav>

      <section className="relative border-b border-white/5">
        <div className="pointer-events-none absolute inset-0"><div className="absolute left-1/2 top-0 h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[170px]" /><div className="absolute -right-20 top-44 h-[360px] w-[360px] rounded-full bg-cyan-500/10 blur-[120px]" /><div className="absolute -left-20 bottom-0 h-[320px] w-[320px] rounded-full bg-fuchsia-600/10 blur-[120px]" /></div>
        <div className="relative mx-auto grid max-w-7xl gap-14 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
          <div>
            <Badge className="border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-violet-200 hover:bg-violet-500/10"><Sparkles className="mr-2 h-3.5 w-3.5" /> One AI agent. Every customer channel.</Badge>
            <h1 className="mt-6 text-5xl font-bold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">Turn every message into a<span className="block bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">business opportunity.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">AgentHub AI connects your customer conversations across WhatsApp, Instagram, Facebook and your website. One intelligent assistant answers, sells, captures leads, follows up and books appointments 24/7.</p>
            <div className="mt-8 flex flex-wrap gap-2">{channels.map((channel) => { const Icon = channel.icon; return <span key={channel.name} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${channel.color}`}><Icon className="h-3 w-3" /></span>{channel.name}</span>; })}</div>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><a href="#pricing"><Button size="lg" className="h-14 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 text-base shadow-xl shadow-violet-700/25 hover:from-violet-500 hover:to-indigo-500">Choose your plan <ArrowRight className="ml-2 h-5 w-5" /></Button></a><a href="#how-it-works"><Button size="lg" variant="outline" className="h-14 rounded-xl border-white/15 bg-white/[0.03] px-7 text-base text-white hover:bg-white/10 hover:text-white"><CirclePlay className="mr-2 h-5 w-5" /> See how it works</Button></a></div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> No coding required</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Your knowledge & products</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Unified inbox</span></div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-7 rounded-[42px] bg-gradient-to-br from-violet-600/25 via-indigo-500/10 to-cyan-500/15 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0c1226] p-3 shadow-2xl shadow-black/50">
              <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[#0a1021]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600"><Bot className="h-4 w-4" /></div><div><p className="text-sm font-semibold">AgentHub AI</p><p className="text-[10px] text-emerald-400">All systems active</p></div></div><Badge className="bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10">24/7 Active</Badge></div>
                <div className="grid min-h-[480px] grid-cols-[92px_1fr] sm:grid-cols-[145px_1fr]">
                  <aside className="border-r border-white/10 p-2 sm:p-3">{['Overview','Inbox','Leads','Bookings','Follow-ups','Knowledge','Products','Integrations'].map((item, i) => <div key={item} className={`mb-1 rounded-lg px-2 py-2 text-[10px] sm:px-3 sm:text-xs ${i===1?'bg-violet-600/25 text-white':'text-slate-500'}`}>{item}</div>)}</aside>
                  <div className="min-w-0 p-3 sm:p-5">
                    <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] text-slate-500">Unified inbox</p><h2 className="text-base font-semibold">Customer conversations</h2></div><div className="flex -space-x-1">{channels.map((c) => { const I=c.icon; return <span key={c.name} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a1021] ${c.color}`}><I className="h-3 w-3" /></span>})}</div></div>
                    <div className="grid gap-3 lg:grid-cols-[.75fr_1.25fr]">
                      <div className="space-y-2">{[['Sarah Ahmed','Instagram','I need details about your plans'],['Michael','Website','Can I book a demo?'],['Ayesha Khan','WhatsApp','What is the price?'],['David Smith','Facebook','Tell me more about this']].map(([name, source, msg], i) => <div key={name} className={`rounded-xl border p-2.5 ${i===0?'border-violet-500/40 bg-violet-500/10':'border-white/8 bg-white/[0.025]'}`}><div className="flex justify-between gap-2"><span className="text-[10px] font-semibold">{name}</span><span className="text-[8px] text-slate-500">{source}</span></div><p className="mt-1 truncate text-[9px] text-slate-400">{msg}</p></div>)}</div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold">Sarah Ahmed</p><p className="text-[9px] text-pink-300">Instagram DM</p></div><span className="text-[9px] text-slate-500">now</span></div><div className="space-y-3 text-[10px]"><div className="max-w-[80%] rounded-xl rounded-tl-sm bg-white/[0.07] p-2.5 text-slate-300">Hi, I need details about your plans.</div><div className="ml-auto max-w-[88%] rounded-xl rounded-tr-sm bg-violet-600/85 p-2.5">Of course! I can help you choose the right AgentHub plan. How many customer channels would you like to automate?</div><div className="max-w-[80%] rounded-xl rounded-tl-sm bg-white/[0.07] p-2.5 text-slate-300">WhatsApp, Instagram and my website.</div><div className="ml-auto max-w-[88%] rounded-xl rounded-tr-sm bg-violet-600/85 p-2.5">Perfect. AgentHub Pro supports multi-channel automation, lead capture and follow-ups.</div></div><div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 p-2"><span className="flex-1 text-[9px] text-slate-500">AgentHub AI is replying...</span><Send className="h-3.5 w-3.5 text-violet-300" /></div></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -right-5 top-16 hidden rounded-2xl border border-white/10 bg-[#10172e]/95 p-3 shadow-xl backdrop-blur sm:block"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15"><MessageCircle className="h-5 w-5 text-emerald-400" /></div><div><p className="text-xs font-semibold">New lead captured</p><p className="text-[10px] text-slate-400">Automatically added to CRM</p></div></div></div>
              <div className="absolute -left-5 bottom-7 hidden rounded-2xl border border-white/10 bg-[#10172e]/95 p-3 shadow-xl backdrop-blur sm:block"><div className="flex items-center gap-3"><CalendarCheck className="h-5 w-5 text-cyan-300" /><div><p className="text-xs font-semibold">Appointment booked</p><p className="text-[10px] text-slate-400">Customer received confirmation</p></div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="channels" className="border-b border-white/5 bg-[#0a0f20] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center"><Badge className="bg-white/5 text-slate-300 hover:bg-white/5">MULTI-CHANNEL AUTOMATION</Badge><h2 className="mt-5 text-3xl font-bold sm:text-5xl">Meet customers where they already talk.</h2><p className="mt-5 text-slate-400">Stop managing separate inboxes. AgentHub brings your conversations into one business automation system.</p></div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[['WhatsApp','Reply to customer messages, answer product questions, capture leads, follow up and support voice-enabled conversations.',MessageCircle,'bg-emerald-600','bg-white/15 text-white','WhatsApp automation'],['Instagram','Respond to incoming customer messages and keep social conversations connected to your business workflow.',Instagram,'bg-gradient-to-br from-pink-500 to-fuchsia-600','bg-white/15 text-white','Instagram DMs'],['Facebook','Bring Messenger conversations into the same AgentHub workspace as your other customer channels.',Facebook,'bg-blue-600','bg-white/15 text-white','Facebook Messenger'],['Website Chat','Install the AgentHub widget and turn website visitors into live conversations, leads and opportunities.',Globe2,'bg-gradient-to-br from-violet-600 to-indigo-700','bg-white/15 text-white','Website widget']].map(([name, desc, Icon, gradient, iconStyle, tag]) => { const I=Icon as typeof MessageCircle; return <Card key={name as string} className={`group overflow-hidden border-white/20 ${gradient as string} text-white shadow-xl shadow-black/30 transition duration-300 hover:-translate-y-1 hover:brightness-110`}><CardContent className="p-6"><div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 ${iconStyle as string}`}><I className="h-7 w-7" /></div><h3 className="text-xl font-bold">{name as string}</h3><p className="mt-3 text-sm leading-6 text-white/85">{desc as string}</p><p className="mt-6 text-xs font-semibold text-white">{tag as string} <ArrowRight className="ml-1 inline h-3 w-3 transition group-hover:translate-x-1" /></p></CardContent></Card>})}
          </div>
        </div>
      </section>

      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start"><div><Badge className="bg-violet-500/10 text-violet-200 hover:bg-violet-500/10">MORE THAN AUTO-REPLIES</Badge><h2 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">A complete AI customer operations system.</h2><p className="mt-5 text-slate-400">AgentHub is designed to help businesses convert conversations into measurable actions instead of simply sending chatbot replies.</p><a href="#pricing" className="mt-8 inline-block"><Button className="rounded-xl">Explore plans <ChevronRight className="ml-1 h-4 w-4" /></Button></a></div>
          <div className="grid gap-4 sm:grid-cols-2">{[[Bot,'Business-trained AI','Use your own knowledge base, services and products so responses are based on your business information.'],[Users,'Automatic lead capture','Turn customer interest into organized leads with conversation context.'],[CalendarCheck,'Appointment booking','Let customers request and book appointments directly through conversations.'],[Repeat2,'Smart follow-ups','Keep opportunities moving with scheduled follow-up workflows and reminders.'],[Database,'Products & pricing','Store products and authorized pricing so the agent can answer relevant customer questions.'],[LayoutDashboard,'Unified dashboard','Monitor conversations, leads, appointments, integrations and AI settings in one workspace.'],[BarChart3,'Business visibility','See activity across your connected channels instead of losing customers between apps.'],[Workflow,'Configurable behavior','Control AI rules, response behavior, languages and channel settings from the dashboard.']].map(([Icon,title,desc]) => { const I=Icon as typeof Bot; return <div key={title as string} className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 transition hover:border-violet-500/40 hover:bg-violet-500/[0.04]"><I className="mb-5 h-6 w-6 text-violet-300" /><h3 className="font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{desc as string}</p></div>})}</div></div></div>
      </section>

      <section id="how-it-works" className="border-y border-white/5 bg-[#0a0f20] py-24"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="text-center"><Badge className="bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/10">HOW IT WORKS</Badge><h2 className="mt-5 text-4xl font-bold sm:text-5xl">From connection to customer action.</h2></div><div className="mt-14 grid gap-6 md:grid-cols-4">{[['01','Choose your plan','Select the package that matches your business size and channels.'],['02','Create your workspace','After successful payment, your AgentHub account and selected subscription are activated.'],['03','Connect your channels','Connect WhatsApp, Instagram, Facebook and install your website widget as available for your plan.'],['04','Train & automate','Add products and knowledge, configure your AI, then let AgentHub handle customer conversations.']].map(([n,title,desc]) => <div key={n} className="relative rounded-2xl border border-white/10 bg-[#0d1428] p-6"><span className="text-5xl font-bold text-violet-500/25">{n}</span><h3 className="mt-6 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{desc}</p></div>)}</div></div></section>

      <section className="py-20"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="grid gap-6 rounded-[30px] border border-white/10 bg-gradient-to-br from-violet-600/15 via-[#11172b] to-cyan-500/10 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12"><div><Badge className="bg-white/10 text-white hover:bg-white/10">BUILT FOR BUSINESS</Badge><h2 className="mt-4 text-3xl font-bold sm:text-4xl">Your AI does not just answer. It helps move the customer journey forward.</h2><p className="mt-4 max-w-2xl text-slate-300">Answer → qualify → capture → follow up → book → hand over to your team when needed.</p></div><div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-xl border border-white/10 bg-black/10 p-4"><Zap className="mx-auto h-5 w-5 text-yellow-300" /><p className="mt-2 text-xs text-slate-300">Instant replies</p></div><div className="rounded-xl border border-white/10 bg-black/10 p-4"><Clock3 className="mx-auto h-5 w-5 text-cyan-300" /><p className="mt-2 text-xs text-slate-300">24/7</p></div><div className="rounded-xl border border-white/10 bg-black/10 p-4"><ShieldCheck className="mx-auto h-5 w-5 text-emerald-300" /><p className="mt-2 text-xs text-slate-300">Your data</p></div></div></div></div></section>

      <section id="pricing" className="border-y border-white/5 bg-[#0a0f20] py-24"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-3xl text-center"><Badge className="bg-violet-500/10 text-violet-200 hover:bg-violet-500/10">PRICING</Badge><h2 className="mt-5 text-4xl font-bold sm:text-5xl">Choose the AI workforce your business needs.</h2><p className="mt-5 text-slate-300">Choose the plan that fits your business and start building your AI-powered customer automation.</p></div>
      {!plansLoaded ? <div className="py-12 text-center text-slate-400">Loading plans...</div> : plans.length > 0 ? <div className="mt-14 grid gap-6 md:grid-cols-3 md:items-start">{plans.map((plan) => { const popular = plan.slug === 'professional'; const price = (plan.price_cents / 100).toFixed(0); return <Card key={plan.id} className={`relative overflow-hidden border ${popular?'border-violet-500 shadow-2xl shadow-violet-500/10':'border-white/10'} bg-[#0d1428] text-white`}>{popular && <div className="bg-gradient-to-r from-violet-600 to-indigo-600 py-2 text-center text-xs font-semibold">MOST POPULAR</div>}<CardContent className="p-7"><h3 className="text-2xl font-bold">{plan.name}</h3><p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-400">{plan.description || 'Flexible AI automation for your business.'}</p><div className="mt-7 flex items-end gap-1"><span className="text-5xl font-bold">${price}</span><span className="mb-2 text-sm text-slate-500">/{plan.billing_period}</span></div><div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-300"><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_agents >= 999 ? 'Unlimited' : plan.max_agents} AI agents</span><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_team_members >= 999 ? 'Unlimited' : plan.max_team_members} team members</span><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_integrations >= 999 ? 'Unlimited' : plan.max_integrations} integrations</span><span className="rounded-lg bg-white/5 px-3 py-2">{plan.max_ai_usage_per_month ? plan.max_ai_usage_per_month.toLocaleString() : 'Custom'} AI usage</span></div><ul className="mt-6 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{feature}</li>)}</ul><Link href={`/checkout?plan=${encodeURIComponent(plan.slug)}`} className="mt-8 block"><Button className={`w-full rounded-xl ${popular?'bg-violet-600 hover:bg-violet-500':'bg-white/10 hover:bg-white/15'}`}>Choose {plan.name} <ArrowRight className="ml-2 h-4 w-4" /></Button></Link></CardContent></Card>})}</div> : <div className="py-12 text-center text-slate-400">Plans are temporarily unavailable. Please contact us to get started.</div>}</div></section>

      <section id="contact" className="py-24"><div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"><div className="rounded-[30px] border border-white/10 bg-gradient-to-br from-[#121a32] to-[#0c1122] p-8 text-center sm:p-14"><Badge className="bg-white/5 text-slate-200 hover:bg-white/5">TALK TO US</Badge><h2 className="mt-5 text-4xl font-bold">Want to see what AgentHub can do for your business?</h2><p className="mx-auto mt-5 max-w-2xl text-slate-400">Message us to discuss your business, channels, automation requirements and the best AgentHub package.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><a href="https://wa.me/923407465567" target="_blank" rel="noreferrer"><Button size="lg" className="h-13 rounded-xl bg-emerald-600 hover:bg-emerald-500"><MessageCircle className="mr-2 h-5 w-5" /> WhatsApp us</Button></a><a href="tel:+923407465567"><Button size="lg" variant="outline" className="h-13 rounded-xl border-white/15 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white"><Phone className="mr-2 h-5 w-5" /> +92 340 7465567</Button></a></div></div></div></section>

      <footer className="border-t border-white/10 py-8 text-sm text-slate-500"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-300" /><span>AgentHub AI</span></div><div className="flex flex-wrap gap-5"><a href="#channels" className="hover:text-white">Channels</a><a href="#features" className="hover:text-white">Features</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="https://wa.me/923407465567" target="_blank" rel="noreferrer" className="hover:text-white">+92 340 7465567</a></div><span>Turn conversations into business actions.</span></div></footer>
    </main>
  );
}
