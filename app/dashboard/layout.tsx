import { DashboardShell } from '@/components/dashboard-shell';
import { SubscriptionGate } from '@/components/subscription-gate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell><SubscriptionGate>{children}</SubscriptionGate></DashboardShell>;
}
