'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Loader2, MessageCircle, Tags } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, user, profile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.is_super_admin) {
        router.push('/admin');
      } else {
        router.push(profile.onboarding_completed ? '/dashboard' : '/onboarding');
      }
    }
  }, [user, profile, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error, profile: signedInProfile } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Sign in failed', description: error, variant: 'destructive' });
      return;
    }

    if (!signedInProfile) {
      toast({ title: 'Sign in incomplete', description: error || 'Your account profile could not be loaded. Please try again.', variant: 'destructive' });
      return;
    }

    toast({ title: 'Welcome back!', description: 'You are now signed in.' });
    router.replace(signedInProfile.is_super_admin ? '/admin' : signedInProfile.onboarding_completed ? '/dashboard' : '/onboarding');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Bot className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold tracking-tight">AgentHub</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in to your workspace</CardTitle>
            <CardDescription>Enter your credentials to access your dashboard</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign In
              </Button>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>New to AgentHub?</span>
                <a
                  href="https://wa.me/923407465567"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Contact AgentHub on WhatsApp"
                  title="Contact us on WhatsApp"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
                <Link
                  href="/#pricing"
                  aria-label="View AgentHub plans"
                  title="View plans"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground"
                >
                  <Tags className="h-4 w-4" />
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
