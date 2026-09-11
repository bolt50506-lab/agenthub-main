import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard-shell';
import { SubscriptionGate } from '@/components/subscription-gate';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell><SubscriptionGate>{children}</SubscriptionGate></DashboardShell>;
}
