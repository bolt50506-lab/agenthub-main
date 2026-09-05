'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Shield, LayoutDashboard, Building, Users, Bot, Plug, BarChart3,
  FileText, Settings, Menu, LogOut, ChevronLeft, Moon, Sun, Bell, Mic2, FileSignature, CreditCard,
} from 'lucide-react';
import { useTheme } from 'next-themes';

const ADMIN_NAV = [
  { href: '/admin', label: 'Platform Overview', icon: LayoutDashboard },
  { href: '/admin/businesses', label: 'Businesses', icon: Building },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/ai-providers', label: 'AI Providers', icon: Bot },
  { href: '/admin/voice-providers', label: 'Voice Providers', icon: Mic2 },
  { href: '/admin/voice-clone-agreements', label: 'Voice Clone Agreements', icon: FileSignature },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/usage', label: 'Usage', icon: BarChart3 },
  { href: '/admin/payments', label: 'Payment Approvals', icon: CreditCard },
  { href: '/admin/logs', label: 'System Logs', icon: FileText },
  { href: '/admin/settings', label: 'Platform Settings', icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!loading) {
      if (!user || !profile?.is_super_admin) {
        router.push('/dashboard');
        return;
      }
    }
  }, [user, profile, loading, router]);

  if (loading || !user || !profile?.is_super_admin) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  const initials = (profile.full_name || profile.email || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 h-16 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">AgentHub</span>
          <span className="text-xs text-muted-foreground">Super Admin</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
        {ADMIN_NAV.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              <item.icon className="w-4 h-4 flex-shrink-0" /> {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <Link href="/dashboard">
          <Button variant="outline" className="w-full gap-2"><ChevronLeft className="w-4 h-4" /> Back to Dashboard</Button>
        </Link>
      </div>

      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 h-auto py-2">
              <Avatar className="w-8 h-8"><AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback></Avatar>
              <div className="flex flex-col items-start overflow-hidden">
                <span className="text-sm font-medium truncate">{profile.full_name || 'Admin'}</span>
                <span className="text-xs text-muted-foreground truncate">{profile.email}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuLabel>{profile.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}><LogOut className="w-4 h-4 mr-2" /> Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] w-full overflow-x-hidden bg-background">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 flex-col border-r border-border bg-card flex-shrink-0 lg:flex">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] p-0"><SidebarContent /></SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-card px-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="w-5 h-5" /></Button>
            <h1 className="text-lg font-semibold hidden sm:block">
              {ADMIN_NAV.find((item) => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href)))?.label ?? 'Admin'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {mounted && theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" className="relative"><Bell className="w-5 h-5" /></Button>
          </div>
        </header>

        <main className="mobile-safe flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
