'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  AlertCircle, ArrowRight, Bot, CheckCircle2, Clock3, DollarSign,
  Loader2, MessageSquareWarning, PackageX, RefreshCw, ShieldCheck,
  Sparkles, TrendingDown, Users, CalendarX,
} from 'lucide-react';

type Finding = {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  amount?: number;
  currency?: string;
  action: string;
};

type ScanData = {
  findings: Finding[];
  recoveredPotential: number;
  currency: string;
  scannedAt: string;
};

const money = (amount: number, currency = 'PKR') =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

export default function AIOperatorPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [scan, setScan] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [autonomous, setAutonomous] = useState(false);

  const runScan = useCallback(async () => {
    if (!activeBusiness) return;
    setScanning(true);

    const businessId = activeBusiness.id;
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const [leadsRes, tasksRes, ordersRes, appointmentsRes, productsRes, conversationsRes] = await Promise.all([
      supabase.from('leads').select('id,name,status,conversion_amount,created_at,updated_at').eq('business_id', businessId),
      supabase.from('follow_up_tasks').select('id,status,scheduled_at,lead_id').eq('business_id', businessId),
      supabase.from('orders').select('id,customer_name,status,total_amount,balance_due,payment_status,currency,updated_at').eq('business_id', businessId),
      supabase.from('appointments').select('id,customer_name,status,date,start_time,service_price,currency,updated_at').eq('business_id', businessId),
      supabase.from('products').select('id,name,availability,status,price,currency').eq('business_id', businessId).eq('status', 'active'),
      supabase.from('conversations').select('id,customer_id,status,channel,last_message_at,updated_at').eq('business_id', businessId).eq('status', 'active'),
    ]);

    const errors = [leadsRes, tasksRes, ordersRes, appointmentsRes, productsRes, conversationsRes].filter((r) => r.error);
    if (errors.length) {
      setScanning(false);
      setLoading(false);
      toast({ title: 'Business scan could not complete', description: errors[0].error?.message, variant: 'destructive' });
      return;
    }

    const leads = leadsRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const orders = ordersRes.data ?? [];
    const appointments = appointmentsRes.data ?? [];
    const products = productsRes.data ?? [];
    const conversations = conversationsRes.data ?? [];

    const pendingLeadIds = new Set(tasks.filter((t) => ['pending', 'processing', 'overdue'].includes(t.status)).map((t) => t.lead_id).filter(Boolean));
    const staleLeads = leads.filter((l) => ['new', 'contacted', 'qualified', 'proposal'].includes(l.status) && l.updated_at < cutoff24h && !pendingLeadIds.has(l.id));
    const overdueTasks = tasks.filter((t) => ['pending', 'overdue'].includes(t.status) && t.scheduled_at < now);
    const unpaidOrders = orders.filter((o) => ['unpaid', 'partial'].includes(o.payment_status) && Number(o.balance_due || 0) > 0);
    const cancelledAppointments = appointments.filter((a) => a.status === 'cancelled' && a.updated_at >= cutoff48h);
    const outOfStock = products.filter((p) => ['out_of_stock', 'limited'].includes(p.availability));
    const quietConversations = conversations.filter((c) => c.last_message_at && c.last_message_at < cutoff24h);

    const potential = staleLeads.reduce((sum, l) => sum + Number(l.conversion_amount || 0), 0) +
      unpaidOrders.reduce((sum, o) => sum + Number(o.balance_due || 0), 0);

    const findings: Finding[] = [];
    if (staleLeads.length) findings.push({
      id: 'stale-leads', title: 'Hot leads are going quiet', severity: 'high', count: staleLeads.length,
      amount: staleLeads.reduce((sum, l) => sum + Number(l.conversion_amount || 0), 0), currency: 'PKR',
      description: `${staleLeads.length} open lead${staleLeads.length === 1 ? '' : 's'} has not moved for more than 24 hours and has no active follow-up task.`,
      action: 'Create recovery follow-ups',
    });
    if (unpaidOrders.length) findings.push({
      id: 'unpaid-orders', title: 'Payments are still outstanding', severity: 'high', count: unpaidOrders.length,
      amount: unpaidOrders.reduce((sum, o) => sum + Number(o.balance_due || 0), 0), currency: unpaidOrders[0]?.currency || 'PKR',
      description: `${unpaidOrders.length} order${unpaidOrders.length === 1 ? '' : 's'} has a remaining balance.`,
      action: 'Prepare payment reminders',
    });
    if (overdueTasks.length) findings.push({
      id: 'overdue-tasks', title: 'Follow-ups are overdue', severity: 'medium', count: overdueTasks.length,
      description: `${overdueTasks.length} scheduled follow-up task${overdueTasks.length === 1 ? '' : 's'} is past its due time.`,
      action: 'Review overdue tasks',
    });
    if (quietConversations.length) findings.push({
      id: 'quiet-conversations', title: 'Conversations need attention', severity: 'medium', count: quietConversations.length,
      description: `${quietConversations.length} active conversation${quietConversations.length === 1 ? '' : 's'} has been quiet for more than 24 hours.`,
      action: 'Review conversations',
    });
    if (cancelledAppointments.length) findings.push({
      id: 'cancelled-appointments', title: 'Cancelled slots may be recoverable', severity: 'medium', count: cancelledAppointments.length,
      description: `${cancelledAppointments.length} appointment${cancelledAppointments.length === 1 ? '' : 's'} was cancelled in the last 48 hours.`,
      action: 'Contact waiting customers',
    });
    if (outOfStock.length) findings.push({
      id: 'inventory', title: 'Demand is hitting inventory limits', severity: 'low', count: outOfStock.length,
      description: `${outOfStock.length} active product${outOfStock.length === 1 ? '' : 's'} is out of stock or limited.`,
      action: 'Review inventory',
    });

    setScan({ findings, recoveredPotential: potential, currency: 'PKR', scannedAt: new Date().toISOString() });
    setLoading(false);
    setScanning(false);
  }, [activeBusiness, toast]);

  useEffect(() => { runScan(); }, [runScan]);

  const highCount = useMemo(() => scan?.findings.filter((f) => f.severity === 'high').length ?? 0, [scan]);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Scanning your business...</div>;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Bot className="h-5 w-5 text-primary" /></div>
            <div>
              <h1 className="text-2xl font-bold">AI Business Operator</h1>
              <p className="text-muted-foreground">Find daily business losses and turn them into actions.</p>
            </div>
          </div>
        </div>
        <Button onClick={runScan} disabled={scanning} variant="outline" className="gap-2">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Run business scan
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">Operator mode</p>
              <p className="text-sm text-muted-foreground">When enabled, AgentHub can prepare and execute approved recovery actions. High-impact actions always require your configured permissions.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={autonomous ? 'default' : 'secondary'}>{autonomous ? 'Active' : 'Review only'}</Badge>
            <Switch checked={autonomous} onCheckedChange={setAutonomous} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Potential recovery</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><DollarSign className="h-5 w-5" />{money(scan?.recoveredPotential ?? 0)}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Based only on amounts already stored in AgentHub. No guesswork added.</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Problems detected</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><AlertCircle className="h-5 w-5" />{scan?.findings.length ?? 0}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{highCount} high-priority issue{highCount === 1 ? '' : 's'} need attention.</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Last scan</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><Clock3 className="h-5 w-5" />Just now</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Live scan across leads, follow-ups, orders, appointments, products and conversations.</p></CardContent></Card>
      </div>

      {scan?.findings.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-14 text-center"><CheckCircle2 className="mb-3 h-10 w-10 text-primary" /><h2 className="text-lg font-semibold">No urgent business problems detected</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">AgentHub found no obvious recovery opportunities in the connected business data right now.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          <div><h2 className="text-lg font-semibold">What the Operator found</h2><p className="text-sm text-muted-foreground">These are evidence-based findings from your existing AgentHub data.</p></div>
          {scan?.findings.map((finding) => {
            const Icon = finding.id === 'stale-leads' ? Users : finding.id === 'unpaid-orders' ? DollarSign : finding.id === 'overdue-tasks' ? Clock3 : finding.id === 'quiet-conversations' ? MessageSquareWarning : finding.id === 'cancelled-appointments' ? CalendarX : PackageX;
            return <Card key={finding.id}>
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{finding.title}</h3><Badge variant={finding.severity === 'high' ? 'destructive' : 'secondary'}>{finding.severity}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{finding.description}</p>{finding.amount ? <p className="mt-2 text-sm font-medium">{money(finding.amount, finding.currency)}</p> : null}</div>
                <Button variant="outline" className="gap-2 shrink-0">{finding.action}<ArrowRight className="h-4 w-4" /></Button>
              </CardContent>
            </Card>;
          })}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Safe automation</CardTitle><CardDescription>AgentHub should never silently send money, delete records, or make irreversible decisions. Operator actions are designed around explicit business permissions and an activity trail.</CardDescription></CardHeader>
      </Card>
    </div>
  );
}
