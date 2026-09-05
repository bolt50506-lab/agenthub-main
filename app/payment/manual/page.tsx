'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bot, Upload, CheckCircle2, Clock3, Loader2, ArrowLeft, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Order = { orderNumber: string; status: string; currency: string; amount: number; paymentMethod: string; rejectionReason?: string | null };

const PAYMENT_DETAILS = {
  easypaisa: { title: 'Easypaisa', account: '03407465567', name: 'Ali Ahmed' },
  jazzcash: { title: 'JazzCash', account: '03407465567', name: 'Ali Ahmed' },
  bank_transfer: { title: 'Bank Alfalah', account: 'PK37ALFH5672005002542366', name: 'Ali Ahmed' },
};

export default function ManualPaymentPage() {
  const params = useSearchParams();
  const orderNumber = params.get('order') || '';
  const [order, setOrder] = useState<Order | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!orderNumber) return;
    const response = await fetch('/api/checkout/status?order=' + encodeURIComponent(orderNumber), { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) setOrder(data);
    else setError(data.error || 'Order not found.');
    setLoading(false);
  };

  useEffect(() => { load(); }, [orderNumber]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return setError('Please upload your payment screenshot.');
    setSubmitting(true); setError('');
    const form = new FormData();
    form.append('order', orderNumber);
    form.append('reference', reference);
    form.append('screenshot', file);
    const response = await fetch('/api/payment-proof', { method: 'POST', body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok) setError(data?.error || 'Unable to submit payment proof.');
    else await load();
    setSubmitting(false);
  }

  if (loading) return <main className="min-h-screen bg-[#070b18] text-white flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></main>;
  if (!order) return <main className="min-h-screen bg-[#070b18] text-white flex items-center justify-center">Payment order not found.</main>;

  const details = PAYMENT_DETAILS[order.paymentMethod as keyof typeof PAYMENT_DETAILS] || PAYMENT_DETAILS.bank_transfer;
  const pendingReview = order.status === 'pending_review';

  async function copyPaymentDetails() {
    const text = `${details.title}\nAccount / IBAN: ${details.account}\nAccount Title: ${details.name}\nAmount: ${order.currency} ${order.amount.toLocaleString()}\nOrder Reference: ${order.orderNumber}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Unable to copy payment details. Please copy the account number manually.');
    }
  }

  return <main className="min-h-screen bg-[#070b18] text-white">
    <header className="border-b border-white/10"><div className="mx-auto max-w-4xl px-4 py-5 flex items-center justify-between"><Link href="/#pricing" className="flex items-center gap-2"><Bot className="h-6 w-6 text-violet-300" /><b>AgentHub AI</b></Link><Link href="/#pricing" className="text-sm text-slate-400"><ArrowLeft className="inline h-4 w-4" /> Back</Link></div></header>
    <div className="mx-auto max-w-4xl px-4 py-10 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-violet-500/30 bg-white/[0.03] p-6">
        <p className="text-sm text-violet-300">MANUAL PAYMENT</p>
        <h1 className="mt-2 text-3xl font-bold">Pay {order.currency} {order.amount.toLocaleString()}</h1>
        <p className="mt-2 text-sm text-slate-400">{order.currency === 'PKR' ? 'Pakistan price is converted live from the USD plan price and this quote is saved for your order.' : 'International checkout is quoted in USD.'}</p>
        <div className="mt-6 rounded-xl border border-white/10 p-4 space-y-3">
          <div className="font-semibold">{details.title}</div>
          <div><p className="text-xs text-slate-500">Account / IBAN</p><p className="font-mono break-all">{details.account}</p></div>
          <div><p className="text-xs text-slate-500">Account title</p><p>{details.name}</p></div>
          <button type="button" onClick={copyPaymentDetails} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-900 transition hover:bg-slate-100 flex items-center justify-center"><Copy className="mr-2 h-4 w-4" /> {copied ? 'Payment details copied' : 'Copy payment details'}</button>
        </div>
        <p className="mt-4 text-xs text-slate-500">Order reference: {order.orderNumber}. Please keep it for your payment record.</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        {pendingReview ? <>
          <Clock3 className="h-12 w-12 text-amber-300" />
          <h2 className="mt-4 text-2xl font-bold">Payment submitted for review</h2>
          <p className="mt-2 text-slate-400">Your screenshot has been received. Your selected plan will activate automatically after approval.</p>
        </> : order.status === 'fulfilled' ? <>
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          <h2 className="mt-4 text-2xl font-bold">Your workspace is ready</h2>
          <Link href="/login" className="mt-5 block"><Button className="w-full">Sign in to AgentHub</Button></Link>
        </> : <form onSubmit={submit} className="space-y-5">
          <div><h2 className="text-2xl font-bold">Upload payment screenshot</h2><p className="mt-2 text-sm text-slate-400">After paying, upload a clear screenshot. We will review and activate your selected plan.</p></div>
          <div><Label>Payment screenshot</Label><input required type="file" accept="image/*" className="sr-only" id="payment-screenshot" onChange={(e) => setFile(e.target.files?.[0] || null)} /><label htmlFor="payment-screenshot" className="mt-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"><span className="rounded bg-slate-100 px-3 py-1.5 font-medium">{file ? 'Change file' : 'Choose file'}</span><span className="min-w-0 flex-1 truncate text-right text-slate-600">{file ? file.name : 'No file selected'}</span></label>{file && <p className="mt-2 text-xs text-emerald-300">✓ Screenshot selected: {file.name}</p>}</div>
          <div><Label>Transaction / reference ID (optional)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-2 border-slate-300 bg-white text-slate-900 placeholder:text-slate-500" placeholder="Enter transaction/reference number" /><p className="mt-1 text-xs text-slate-500">If you entered a reference number, it will be saved with this payment submission.</p></div>
          {order.status === 'rejected' && <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">Previous submission was rejected: {order.rejectionReason || 'Please submit a clearer proof.'}</div>}
          {error && <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">{error}</div>}
          <Button disabled={submitting} className="w-full h-12">{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="mr-2 h-4 w-4" /> Submit payment for approval</>}</Button>
        </form>}
      </section>
    </div>
  </main>;
}