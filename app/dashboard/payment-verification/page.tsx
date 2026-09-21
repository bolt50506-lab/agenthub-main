'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Review = {
  id:string; order_number:string; billing_cycle:string; customer_name:string; customer_email:string;
  business_name:string; country_code:string; currency:string; amount_cents:number; payment_method:string;
  payment_screenshot_path:string|null; payment_reference:string|null; status:string; submitted_at:string|null;
  rejection_reason:string|null; screenshotUrl:string|null; subscription_plans?:{name:string;slug:string}|null;
};

export default function PaymentVerificationPage(){
  const {session}=useAuth(); const {toast}=useToast();
  const [rows,setRows]=useState<Review[]>([]); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState<string|null>(null);

  const load=async()=>{
    if(!session?.access_token){setLoading(false);return;}
    const res=await fetch('/api/admin/payment-review',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
    const data=await res.json();
    if(res.ok)setRows(data.orders||[]); else toast({title:'Unable to load payment reviews',description:data.error,variant:'destructive'});
    setLoading(false);
  };
  useEffect(()=>{load()},[session?.access_token]);

  const review=async(id:string,action:'approve'|'reject')=>{
    if(!session?.access_token)return;
    let reason='';
    if(action==='reject'){reason=window.prompt('Reason for rejection:','Payment proof could not be verified.')||'Payment proof could not be verified.';}
    setBusy(id+action);
    const res=await fetch('/api/admin/payment-review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({orderId:id,action,reason})});
    const data=await res.json(); setBusy(null);
    if(!res.ok){toast({title:'Review failed',description:data.error,variant:'destructive'});return;}
    toast({title:action==='approve'?'Payment approved':'Payment rejected',description:action==='approve'?'The account/workspace has been activated automatically.':'The customer can submit a corrected proof.'});
    await load();
  };

  if(loading)return <div className="animate-pulse text-muted-foreground">Loading payment verification...</div>;

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6"/>Payment Verification</h1><p className="text-sm text-muted-foreground mt-1">Verify manual payment screenshots before AgentHub creates or activates the customer account.</p></div>
    {!rows.length&&<Card><CardContent className="py-14 text-center text-muted-foreground">No payment proofs are waiting for review.</CardContent></Card>}
    {rows.map(row=><Card key={row.id}>
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="text-base">{row.customer_name} · {row.business_name}</CardTitle><p className="text-sm text-muted-foreground">{row.customer_email} · {row.order_number}</p></div><Badge variant={row.status==='pending_review'?'secondary':'destructive'}>{row.status}</Badge></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4 text-sm"><div><span className="text-muted-foreground">Plan</span><div className="font-medium">{row.subscription_plans?.name||'Unknown'}</div></div><div><span className="text-muted-foreground">Amount</span><div className="font-medium">{row.currency} {Number(row.amount_cents/100).toLocaleString()}</div></div><div><span className="text-muted-foreground">Cycle</span><div className="font-medium">{row.billing_cycle}</div></div><div><span className="text-muted-foreground">Method / Ref</span><div className="font-medium">{row.payment_method}{row.payment_reference ? ' · '+row.payment_reference : ''}</div></div></div>
        {row.screenshotUrl&&<a href={row.screenshotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm underline"><ExternalLink className="h-4 w-4"/>Open payment screenshot</a>}
        {row.status==='pending_review'&&<div className="flex flex-wrap gap-2"><Button onClick={()=>review(row.id,'approve')} disabled={!!busy}><CheckCircle2 className="mr-2 h-4 w-4"/>{busy===row.id+'approve'?<Loader2 className="h-4 w-4 animate-spin"/>:'Approve & Activate'}</Button><Button variant="destructive" onClick={()=>review(row.id,'reject')} disabled={!!busy}><XCircle className="mr-2 h-4 w-4"/>{busy===row.id+'reject'?'Rejecting...':'Reject'}</Button></div>}
      </CardContent>
    </Card>)}
  </div>;
}
