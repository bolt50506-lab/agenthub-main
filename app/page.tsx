'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Shield, Bot, ArrowRight, Check, Phone, MessageCircle, Sparkles, CirclePlay, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { SubscriptionPlan } from '@/lib/types/database';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.is_super_admin) {
        router.push('/admin');
      } else if (!profile.onboarding_completed) {
        router.push('/onboarding');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, profile, loading, router]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      setPlans((data as SubscriptionPlan[]) ?? []);
    })();
  }, []);

  // Public AgentHub AI website chat widget
  useEffect(() => {
    const scriptId = 'agenthub-public-chat-widget';
    if (document.getElementById(scriptId)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `${window.location.origin}/widget-js?business=11f62525-3c27-474d-854e-e474c7211d43`;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // The widget is global and should remain mounted while navigating
      // within the public landing page.
    };
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Nav */}
      <nav className="border-b border-border/40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentHub</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</Link>
            <Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="#contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/login">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Premium Hero */}
      <section className="relative overflow-hidden bg-[#050816] text-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-[650px] w-[900px] -translate-x-1/2 rounded-full bg-violet-700/20 blur-[150px]" />
          <div className="absolute right-[-10%] top-[20%] h-[360px] w-[360px] rounded-full bg-indigo-500/15 blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200 mb-6">
              <Sparkles className="w-4 h-4" />
              Your AI Employee for WhatsApp & Your Website
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.04]">
              AgentHub AI Works.
              <span className="block mt-2 bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">You Grow.</span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">
              AgentHub automatically answers customers, captures leads, shares product information,
              books appointments and follows up — so your business stays active 24/7.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 text-sm text-slate-200">
              {[
                'AI-powered customer conversations',
                'Instant lead capture & follow-ups',
                'WhatsApp & website automation',
                'Appointments & reminders',
                'Knowledge base & products',
                'One powerful business dashboard',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                    <Check className="w-4 h-4" />
                  </span>
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link href="#pricing">
                <Button size="lg" className="h-14 w-full sm:w-auto rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 text-base shadow-xl shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500">
                  Start with AgentHub <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button size="lg" variant="outline" className="h-14 w-full sm:w-auto rounded-xl border-white/20 bg-white/[0.03] px-7 text-base text-white hover:bg-white/10 hover:text-white">
                  <CirclePlay className="mr-2 w-5 h-5" />
                  See How It Works
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-6 rounded-[38px] bg-gradient-to-br from-violet-500/25 to-indigo-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1024] p-3 shadow-2xl shadow-black/50">
              <div className="grid min-h-[500px] grid-cols-[165px_1fr] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1124]">
                <aside className="hidden sm:block border-r border-white/10 bg-[#0a0f20] p-4">
                  <div className="mb-7 flex items-center gap-2 text-sm font-semibold">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600"><Bot className="w-4 h-4" /></div>
                    AgentHub
                  </div>
                  {['Dashboard','Conversations','Leads','Appointments','Follow-ups','Agents','Knowledge Base','Products','Integrations'].map((item, i) => (
                    <div key={item} className={i === 0 ? 'mb-1 rounded-lg bg-violet-600/30 px-3 py-2 text-xs text-white' : 'mb-1 rounded-lg px-3 py-2 text-xs text-slate-400'}>
                      {item}
                    </div>
                  ))}
                </aside>

                <div className="min-w-0 p-4 sm:p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500">AgentHub Dashboard</p>
                      <h2 className="mt-1 text-lg font-semibold">Your Business at a Glance</h2>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20">
                      <Bot className="w-4 h-4 text-violet-300" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      ['Conversations','1,248'],
                      ['Leads Captured','458'],
                      ['Appointments','128'],
                      ['Active Customers','892'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                        <p className="text-[10px] text-slate-500">{label}</p>
                        <p className="mt-1 text-xl font-bold">{value}</p>
                        <p className="mt-1 text-[9px] text-emerald-400">↑ Active this week</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                      <div className="mb-3 flex justify-between text-xs">
                        <span className="font-semibold">Conversations</span>
                        <span className="text-violet-300">View all</span>
                      </div>
                      {['John Doe','Sarah Williams','Mike Johnson','Emma Brown'].map((name, i) => (
                        <div key={name} className="mb-2 flex items-center gap-2 rounded-lg bg-white/[0.03] p-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-[10px]">{name.charAt(0)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[10px] font-medium">{name}</p>
                            <p className="text-[9px] text-slate-500">{i % 2 ? 'WhatsApp' : 'Website Widget'}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                      <div className="mb-3 flex justify-between">
                        <div>
                          <p className="text-xs font-semibold">John Doe</p>
                          <p className="text-[9px] text-violet-300">Website Widget</p>
                        </div>
                        <span className="text-[9px] text-slate-500">2 min ago</span>
                      </div>
                      <div className="space-y-3 text-[10px]">
                        <div className="rounded-xl rounded-tl-sm bg-white/[0.06] p-2.5 text-slate-300">Hi, I want to know more about your services.</div>
                        <div className="ml-6 rounded-xl rounded-tr-sm bg-violet-600/80 p-2.5">Hello! 👋 I can help with information about our services. What would you like to know?</div>
                        <div className="rounded-xl rounded-tl-sm bg-white/[0.06] p-2.5 text-slate-300">What are your pricing plans?</div>
                        <div className="ml-6 rounded-xl rounded-tr-sm bg-violet-600/80 p-2.5">I can explain the available plans and help you choose the right one.</div>
                      </div>
                      <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] p-2">
                        <span className="flex-1 text-[9px] text-slate-500">Reply as AgentHub AI...</span>
                        <Send className="w-3.5 h-3.5 text-violet-300" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -left-5 bottom-8 hidden sm:flex items-center gap-3 rounded-2xl border border-white/10 bg-[#11182f]/95 p-3 shadow-xl backdrop-blur">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold">WhatsApp Connected</p>
                  <p className="text-[10px] text-slate-400">AI replies automatically</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Bot, title: 'AI Agents', desc: 'Deploy agents that understand your business and act on conversations — creating leads, appointments, and tasks automatically.' },
            { icon: MessageSquare, title: 'WhatsApp Ready', desc: 'Built for the WhatsApp Cloud API. Group rules, private conversations, and smart response modes built in.' },
            { icon: Shield, title: 'Multi-Tenant Secure', desc: 'Every business gets isolated data with row-level security. Your conversations, leads, and customers stay private.' },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6 text-left">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Everything your AI agent can do</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            'Answer customer questions from your knowledge base',
            'Search and quote authorized product prices',
            'Capture and qualify leads automatically',
            'Book appointments with availability checking',
            'Create follow-up tasks and reminders',
            'Analyze images, documents, and prescriptions',
            'Respect group rules — reply only when appropriate',
            'Never invent prices or make medical diagnoses',
          ].map((item) => (
            <div key={item} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">Simple, transparent pricing</h2>
        <p className="text-center text-muted-foreground mb-5 max-w-xl mx-auto">
          Choose the plan that fits your business. Contact us to get started — we&apos;ll help you choose the right plan and get your workspace set up.
        </p>
        <div className="flex justify-center mb-12">
          <a href="https://wa.me/923407465567" target="_blank" rel="noreferrer">
            <Button variant="outline" className="gap-2">
              <Phone className="w-4 h-4" />
              Contact us: +92 340 7465567
            </Button>
          </a>
        </div>
        {plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {plans.map((plan, idx) => {
              const isPopular = plan.slug === 'professional';
              return (
                <Card key={plan.id} className={`relative ${isPopular ? 'border-primary shadow-lg md:scale-105' : ''}`}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-4xl font-bold">${(plan.price_cents / 100).toFixed(0)}</span>
                      <span className="text-muted-foreground">/{plan.billing_period}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="px-2 py-1 rounded-md bg-muted">{plan.max_agents >= 999 ? 'Unlimited' : plan.max_agents} agents</span>
                      <span className="px-2 py-1 rounded-md bg-muted">{plan.max_conversations ? `${plan.max_conversations.toLocaleString()} convos` : 'Unlimited convos'}</span>
                      <span className="px-2 py-1 rounded-md bg-muted">{plan.max_team_members >= 999 ? 'Unlimited' : plan.max_team_members} members</span>
                    </div>
                    <ul className="space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-2">
                      <Link href="/login" className="block">
                        <Button className="w-full" variant={isPopular ? 'default' : 'outline'}>
                          Get Started
                        </Button>
                      </Link>
                      <a href="https://wa.me/923407465567" target="_blank" rel="noreferrer" className="block">
                        <Button className="w-full gap-2" variant="ghost">
                          <MessageCircle className="w-4 h-4" />
                          Ask about this plan
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Contact */}
      <section id="contact" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-2xl border border-border bg-card p-8 sm:p-12 text-center shadow-sm">
          <Badge variant="secondary" className="mb-4">Contact Us</Badge>
          <h2 className="text-3xl font-bold mb-4">Need help choosing the right plan?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Talk directly with our team on WhatsApp for pricing, setup assistance, demos, and questions about AgentHub AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="https://wa.me/923407465567" target="_blank" rel="noreferrer">
              <Button size="lg" className="gap-2">
                <MessageCircle className="w-5 h-5" />
                Chat on WhatsApp
              </Button>
            </a>
            <a href="tel:+923407465567">
              <Button size="lg" variant="outline" className="gap-2">
                <Phone className="w-5 h-5" />
                +92 340 7465567
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-2xl bg-primary text-primary-foreground p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to automate your conversations?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
            Sign in to access your dashboard, set up your AI agent, and start turning conversations into business actions.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/login">
              <Button size="lg" variant="secondary" className="gap-2">
                Sign In <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="https://wa.me/923407465567" target="_blank" rel="noreferrer">
              <Button size="lg" variant="outline" className="gap-2 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <MessageCircle className="w-4 h-4" />
                Contact Us
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="w-4 h-4" />
            <span>AgentHub</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="https://wa.me/923407465567" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">WhatsApp: +92 340 7465567</a>
            <span className="hidden sm:inline">Turn Conversations Into Business Actions</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
