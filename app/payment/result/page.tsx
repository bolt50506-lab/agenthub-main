
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bot, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentResultPage() {
  const params = useSearchParams();
  const order = params.get('order') || '';
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    if (!order) return;
    let active = true;
    async function check() {
      const response = await fetch(`/api/checkout/status?order=${encodeURIComponent(order)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (active && data?.status) setStatus(data.status);
    }
    check();
    const timer = window.setInterval(check, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [order]);

  const fulfilled = status === 'fulfilled';
  const failed = status === 'failed' || status === 'cancelled';

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070b18] px-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d1428] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600"><Bot className="h-6 w-6" /></div>
        {fulfilled ? <><CheckCircle2 className="mx-auto mt-8 h-14 w-14 text-emerald-400" /><h1 className="mt-5 text-3xl font-bold">Your AgentHub workspace is ready.</h1><p className="mt-3 text-slate-400">Payment was verified and your account and subscription have been activated. Sign in with the email and password you created at checkout.</p><Link href="/login" className="mt-7 block"><Button className="w-full rounded-xl bg-violet-600 hover:bg-violet-500">Sign in to AgentHub</Button></Link></> : failed ? <><XCircle className="mx-auto mt-8 h-14 w-14 text-red-400" /><h1 className="mt-5 text-3xl font-bold">Payment was not completed.</h1><p className="mt-3 text-slate-400">No subscription was activated. You can return and try checkout again.</p><Link href="/#pricing" className="mt-7 block"><Button className="w-full rounded-xl">Return to plans</Button></Link></> : <><Clock3 className="mx-auto mt-8 h-14 w-14 text-cyan-300" /><h1 className="mt-5 text-3xl font-bold">Confirming your payment...</h1><p className="mt-3 text-slate-400">We are waiting for secure payment confirmation. Your AgentHub workspace will activate automatically after verification.</p><div className="mt-6 flex items-center justify-center gap-2 text-sm text-violet-300"><Loader2 className="h-4 w-4 animate-spin" /> Checking activation status</div></>}
      </div>
    </main>
  );
}
