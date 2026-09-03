'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Zap, Shield, Bot, Calendar, Users, ArrowRight, Check } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Nav */}
      <nav className="border-b border-border/40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentHub</span>
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

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
          <Zap className="w-3.5 h-3.5" />
          AI-Powered Business Automation
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground max-w-3xl mx-auto leading-tight">
          Turn Conversations Into Business Actions
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Connect WhatsApp and other channels. Deploy AI agents that answer questions, capture leads,
          book appointments, and create follow-ups — all organized in one dashboard.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/login">
            <Button size="lg" className="gap-2">
              Get Started <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="#pricing">
            <Button size="lg" variant="outline">View Plans</Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
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

      {/* Capabilities */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
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
        <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
          Choose the plan that fits your business. Contact us to get started — we&apos;ll set up your workspace and assign your plan.
        </p>
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
                    <Link href="/login" className="block">
                      <Button className="w-full" variant={isPopular ? 'default' : 'outline'}>
                        Get Started
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-2xl bg-primary text-primary-foreground p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to automate your conversations?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
            Sign in to access your dashboard, set up your AI agent, and start turning conversations into business actions.
          </p>
          <Link href="/login">
            <Button size="lg" variant="secondary" className="gap-2">
              Sign In <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="w-4 h-4" />
            <span>AgentHub</span>
          </div>
          <p className="text-sm text-muted-foreground">Turn Conversations Into Business Actions</p>
        </div>
      </footer>
    </div>
  );
}
