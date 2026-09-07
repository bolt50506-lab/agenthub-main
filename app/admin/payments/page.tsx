'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Eye, Loader2, XCircle } from 'lucide-react';

type Payment = { id: string; order_number: string; customer_name: string; customer_email: string; business_name: string; whatsapp_number: string | null; country_code: string; currency: string; amount_cents: number; payment_method: string; status: string; payment_reference: string | null; submitted_at: string | null; screenshotUrl: string | null; subscription_plans: { name: string; slug: string } | null; };
type PendingOrder = { id: string; order_number: string; customer_name: string; customer_email: string; business_name: string; status: string; amount_cents: number; currency: string; whatsapp_number: string | null; };
type Verification = { id: string; sender_phone: string | null; customer_name: string | null; payment_reference: string | null; amount: number | null; currency: string | null; status: string; created_at: string; screenshotUrl: string | null; channel: string | null; business: { id: string; name: string } | null; order: { order_number: string; customer_email: string; business_name: string; status: string } | null; };

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');
  const [error, setError] = useState('');
  const { session } = useAuth();

  async function load() {
    if (!session?.access_token) { setPayments([]); setVerifications([]); setPendingOrders([]); setError('Your admin session is not ready. Please refresh or sign in again.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [paymentsResponse, verificationsResponse] = await Promise.all([
        fetch('/api/admin/payments', { cache: 'no-store', headers }),
        fetch('/api/admin/payment-verifications', { cache: 'no-store', headers }),
      ]);
      const [paymentsData, verificationsData] = await Promise.all([
        paymentsResponse.json().catch(() => null),
        verificationsResponse.json().catch(() => null),
      ]);
      if (paymentsResponse.ok) setPayments(paymentsData?.payments || []);
      if (verificationsResponse.ok) { setVerifications(verificationsData?.verifications || []); setPendingOrders(verificationsData?.pendingOrders || []); }
      const errors = [
        !paymentsResponse.ok ? (paymentsData?.error || `Unable to load checkout payments (HTTP ${paymentsResponse.status}).`) : '',
        !verificationsResponse.ok ? (verificationsData?.error || `Unable to load WhatsApp payment verifications (HTTP ${verificationsResponse.status}).`) : '',
      ].filter(Boolean);
      if (errors.length) setError(errors.join(' '));
    } catch {
      setError('Unable to connect to the payment approvals service.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [session?.access_token]);

  async function actOrder(orderId: string, action: 'approve' | 'reject') {
    if (action === 'reject' && !window.confirm('Reject this payment proof?')) return;
    if (action === 'approve' && !window.confirm('Approve payment and automatically create the account and activate the selected plan?')) return;
    setActing(orderId);
    if (!session?.access_token) { alert('Your admin session is not ready. Please sign in again.'); setActing(''); return; }
    const r = await fetch('/api/admin/payments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ orderId, action }) });
    const data = await r.json().catch(() => null);
    if (!r.ok) alert(data?.error || 'Action failed');
    await load(); setActing('');
  }

  async function actVerification(id: string, action: 'approve' | 'reject') {
    if (action === 'reject' && !window.confirm('Reject this WhatsApp payment proof?')) return;
    if (action === 'approve' && !window.confirm('Approve this payment proof for the exact business and verified sender number?')) return;
    setActing(id);
    if (!session?.access_token) { alert('Your admin session is not ready. Please sign in again.'); setActing(''); return; }
    const r = await fetch('/api/admin/payment-verifications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ id, action }) });
    const data = await r.json().catch(() => null);
    if (!r.ok) alert(data?.error || 'Action failed');
    await load(); setActing('');
  }

  async function linkVerification(id: string) {
    const orderId = selectedOrder[id];
    if (!orderId) { alert('Please select the correct pending checkout order first.'); return; }
    if (!window.confirm('Link this WhatsApp payment screenshot to the selected checkout order?')) return;
    if (!session?.access_token) { alert('Your admin session is not ready. Please sign in again.'); return; }
    setActing(id);
    const r = await fetch('/api/admin/payment-verifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, action: 'link_order', orderId }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) alert(data?.error || 'Unable to link the checkout order');
    await load();
    setActing('');
  }

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading payments...</div>;

  return <div className="space-y-8">
    <div><h2 className="text-2xl font-bold">Payment Approvals</h2><p className="text-sm text-muted-foreground mt-1">Review website checkout proofs and payment screenshots received through WhatsApp.</p></div>
    {error && <Card className="border-red-500/40"><CardContent className="p-4 text-sm text-red-500">{error}</CardContent></Card>}

    <section className="space-y-4">
      <div><h3 className="text-lg font-semibold">WhatsApp Payment Verifications</h3><p className="text-sm text-muted-foreground">Screenshots sent in chat. Approval is scoped to the exact business and verified sender number.</p></div>
      {verifications.length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No WhatsApp payment proofs yet.</CardContent></Card> :
        <div className="grid gap-4">{verifications.map((v) => <Card key={v.id}>
          <CardHeader className="pb-3"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><CardTitle>{v.customer_name || v.sender_phone || 'Customer'} — {v.business?.name || v.order?.business_name || 'Business pending match'}</CardTitle><CardDescription>{v.order?.order_number || 'No checkout order linked'} · {v.channel || 'whatsapp'} · {v.status}</CardDescription></div><b>{v.amount != null ? `${v.currency || ''} ${Number(v.amount).toLocaleString()}` : 'Amount not supplied'}</b></div></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_240px]"><div className="space-y-2 text-sm"><p><span className="text-muted-foreground">Verified sender:</span> <strong>{v.sender_phone || 'Missing'}</strong></p><p><span className="text-muted-foreground">Reference:</span> {v.payment_reference || 'Not provided'}</p><p><span className="text-muted-foreground">Received:</span> {new Date(v.created_at).toLocaleString()}</p><p><span className="text-muted-foreground">Order email:</span> {v.order?.customer_email || 'Not linked'}</p></div>
          {v.screenshotUrl && <a href={v.screenshotUrl} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full"><Eye className="mr-2 h-4 w-4" /> View Screenshot</Button></a>}
          {!v.order && <div className="space-y-2 lg:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-sm font-medium">This screenshot is not linked to a checkout order.</p><div className="flex flex-col gap-2 sm:flex-row"><select value={selectedOrder[v.id] || ''} onChange={(e) => setSelectedOrder((current) => ({ ...current, [v.id]: e.target.value }))} className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"><option value="">Select the correct pending order</option>{pendingOrders.map((o) => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name} — {o.business_name} — {o.currency} {(Number(o.amount_cents)/100).toLocaleString()}</option>)}</select><Button disabled={acting===v.id} onClick={() => linkVerification(v.id)}>Link Order</Button></div></div>}
          {v.status === 'pending_review' && v.order && <div className="flex gap-2 lg:col-span-2"><Button disabled={acting===v.id} onClick={() => actVerification(v.id,'approve')} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-2 h-4 w-4" /> Approve & Activate</Button><Button disabled={acting===v.id} variant="destructive" onClick={() => actVerification(v.id,'reject')}><XCircle className="mr-2 h-4 w-4" /> Reject</Button></div>}
        </CardContent></Card>)}</div>}
    </section>

    <section className="space-y-4">
      <div><h3 className="text-lg font-semibold">Website Checkout Payment Proofs</h3></div>
      {payments.length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No website payment proofs.</CardContent></Card> :
        <div className="grid gap-4">{payments.map((p) => <Card key={p.id}>
          <CardHeader className="pb-3"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><CardTitle>{p.customer_name} — {p.subscription_plans?.name || 'Plan'}</CardTitle><CardDescription>{p.customer_email} · {p.business_name} · {p.order_number}</CardDescription></div><b>{p.currency} {(Number(p.amount_cents)/100).toLocaleString()}</b></div></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_240px]"><div className="space-y-2 text-sm"><p><span className="text-muted-foreground">WhatsApp:</span> <strong>{p.whatsapp_number || 'Not provided'}</strong></p><p><span className="text-muted-foreground">Method:</span> {p.payment_method}</p><p><span className="text-muted-foreground">Reference:</span> {p.payment_reference || 'Not provided'}</p><p><span className="text-muted-foreground">Submitted:</span> {p.submitted_at ? new Date(p.submitted_at).toLocaleString() : 'Not submitted'}</p></div>
            {p.screenshotUrl && <a href={p.screenshotUrl} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full"><Eye className="mr-2 h-4 w-4" /> View Screenshot</Button></a>}
            {p.status === 'pending_review' && <div className="flex gap-2 lg:col-span-2"><Button disabled={acting===p.id} onClick={() => actOrder(p.id,'approve')} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-2 h-4 w-4" /> Approve & Activate</Button><Button disabled={acting===p.id} variant="destructive" onClick={() => actOrder(p.id,'reject')}><XCircle className="mr-2 h-4 w-4" /> Reject</Button></div>}
          </CardContent></Card>)}</div>}
    </section>
  </div>;
}
