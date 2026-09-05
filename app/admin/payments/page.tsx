'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Eye, Loader2, XCircle } from 'lucide-react';

type Payment = {
  id: string; order_number: string; customer_name: string; customer_email: string; business_name: string;
  country_code: string; currency: string; amount_cents: number; payment_method: string; status: string;
  payment_reference: string | null; submitted_at: string | null; screenshotUrl: string | null;
  subscription_plans: { name: string; slug: string } | null;
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/payments', { cache: 'no-store' });
    const data = await r.json();
    if (r.ok) setPayments(data.payments || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function act(orderId: string, action: 'approve' | 'reject') {
    if (action === 'reject' && !window.confirm('Reject this payment proof?')) return;
    if (action === 'approve' && !window.confirm('Approve payment and automatically create the account and activate the selected plan?')) return;
    setActing(orderId);
    const r = await fetch('/api/admin/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, action }) });
    const data = await r.json().catch(() => null);
    if (!r.ok) alert(data?.error || 'Action failed');
    await load();
    setActing('');
  }

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading payments...</div>;

  return <div className="space-y-6">
    <div><h2 className="text-2xl font-bold">Payment Approvals</h2><p className="text-sm text-muted-foreground mt-1">Review payment screenshots. Approval automatically creates the customer workspace and activates the paid plan.</p></div>
    {payments.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">No submitted payment proofs.</CardContent></Card> :
      <div className="grid gap-4">
        {payments.map((p) => <Card key={p.id}>
          <CardHeader className="pb-3"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><CardTitle>{p.customer_name} — {p.subscription_plans?.name || 'Plan'}</CardTitle><CardDescription>{p.customer_email} · {p.business_name} · {p.order_number}</CardDescription></div><b>{p.currency} {(Number(p.amount_cents)/100).toLocaleString()}</b></div></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_240px]">
            <div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Method:</span> {p.payment_method}</p><p><span className="text-muted-foreground">Reference:</span> {p.payment_reference || 'Not provided'}</p><p><span className="text-muted-foreground">Submitted:</span> {p.submitted_at ? new Date(p.submitted_at).toLocaleString() : 'Not submitted'}</p></div>
            {p.screenshotUrl && <a href={p.screenshotUrl} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full"><Eye className="mr-2 h-4 w-4" /> View Screenshot</Button></a>}
            {p.status === 'pending_review' && <div className="flex gap-2 lg:col-span-2"><Button disabled={acting===p.id} onClick={() => act(p.id,'approve')} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-2 h-4 w-4" /> Approve & Activate</Button><Button disabled={acting===p.id} variant="destructive" onClick={() => act(p.id,'reject')}><XCircle className="mr-2 h-4 w-4" /> Reject</Button></div>}
          </CardContent>
        </Card>)}
      </div>}
  </div>;
}