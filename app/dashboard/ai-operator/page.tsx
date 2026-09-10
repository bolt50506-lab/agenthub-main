'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, ArrowRight, Bot, CalendarX, CheckCircle2, Clock3, DollarSign, Loader2, MessageSquareWarning, PackageX, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react';

type Finding = { id:string; title:string; description:string; severity:'high'|'medium'|'low'; count:number; amount?:number; currency?:string; actionType?:string; entityIds?:string[] };
type OperatorAction = { id:string; action_type:string; entity_type?:string; entity_id?:string; title:string; description?:string; status:string; risk_level:string; created_at:string; error_message?:string; result?:Record<string,unknown> };
type Settings = { mode:'review'|'prepare'|'autonomous'; stale_lead_hours:number; quiet_conversation_hours:number; auto_followups:boolean; auto_payment_reminders:boolean; auto_appointment_recovery:boolean; inventory_alerts:boolean };
type ScanData = { findings:Finding[]; recoveredPotential:number; scannedAt:string };
type ToggleKey = 'auto_followups'|'auto_payment_reminders'|'auto_appointment_recovery'|'inventory_alerts';

const money = (amount:number, currency='PKR') => new Intl.NumberFormat('en-PK',{style:'currency',currency,maximumFractionDigits:0}).format(amount);

async function api(body:Record<string,unknown>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch('/api/ai-operator',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const json = await response.json().catch(()=>({}));
  if (!response.ok || json.ok === false) throw new Error(json.error || 'Operator request failed');
  return json;
}

export default function AIOperatorPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [scan,setScan] = useState<ScanData|null>(null);
  const [settings,setSettings] = useState<Settings|null>(null);
  const [actions,setActions] = useState<OperatorAction[]>([]);
  const [loading,setLoading] = useState(true);
  const [scanning,setScanning] = useState(false);
  const [busyAction,setBusyAction] = useState<string|null>(null);

  const refresh = useCallback(async (showToast=false) => {
    if (!activeBusiness) return;
    setScanning(true);
    try {
      const result = await api({action:'scan'});
      setSettings(result.settings);
      setActions(result.actions || []);
      setScan({findings:result.findings || [], recoveredPotential:Number(result.recoveredPotential||0), scannedAt:result.scannedAt});
      if (showToast) toast({title:'Business scan complete',description:`Found ${(result.findings||[]).length} issue categories.`});
    } catch (error) {
      toast({title:'Business scan failed',description:error instanceof Error?error.message:'Unable to scan business',variant:'destructive'});
    } finally { setLoading(false); setScanning(false); }
  },[activeBusiness,toast]);

  useEffect(()=>{ refresh(); },[refresh]);

  const updateSettings = async (patch:Partial<Settings>) => {
    try {
      const result = await api({action:'settings',...patch});
      setSettings(result.settings);
      toast({title:'Operator settings saved'});
    } catch (error) { toast({title:'Could not save settings',description:error instanceof Error?error.message:'Unknown error',variant:'destructive'}); }
  };

  const execute = async (actionId:string, approve=false) => {
    setBusyAction(actionId);
    try {
      if (approve) await api({action:'approve',action_id:actionId});
      await api({action:'execute',action_id:actionId});
      toast({title:'Operator action completed',description:'The action was recorded in the business activity trail.'});
      await refresh();
    } catch (error) { toast({title:'Action could not be completed',description:error instanceof Error?error.message:'Unknown error',variant:'destructive'}); }
    finally { setBusyAction(null); }
  };

  const highCount = useMemo(()=>scan?.findings.filter(f=>f.severity==='high').length??0,[scan]);
  if (!activeBusiness) return <Card><CardContent className="py-12 text-center text-muted-foreground">Select a business to use the AI Business Operator.</CardContent></Card>;
  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Scanning your business...</div>;

  const toggles: Array<{key:ToggleKey; label:string; value:boolean}> = [
    {key:'auto_followups',label:'Lead recovery',value:Boolean(settings?.auto_followups)},
    {key:'auto_payment_reminders',label:'Payment reminders',value:Boolean(settings?.auto_payment_reminders)},
    {key:'auto_appointment_recovery',label:'Appointment recovery',value:Boolean(settings?.auto_appointment_recovery)},
    {key:'inventory_alerts',label:'Inventory alerts',value:Boolean(settings?.inventory_alerts)},
  ];

  return <div className="max-w-6xl space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Bot className="h-5 w-5 text-primary"/></div><div><h1 className="text-2xl font-bold">AI Business Operator</h1><p className="text-muted-foreground">Find daily business losses and turn them into controlled actions.</p></div></div>
      <Button onClick={()=>refresh(true)} disabled={scanning} variant="outline" className="gap-2">{scanning?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}Run business scan</Button>
    </div>

    <Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="p-5 space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-primary"/><div><p className="font-semibold">Operator control</p><p className="text-sm text-muted-foreground">Choose how much authority AgentHub has. Review only never executes. Prepare creates proposed actions. Autonomous executes only the action types you explicitly enable.</p></div></div><div className="flex gap-2">{(['review','prepare','autonomous'] as const).map(mode=><Button key={mode} size="sm" variant={settings?.mode===mode?'default':'outline'} onClick={()=>updateSettings({mode})}>{mode==='review'?'Review only':mode==='prepare'?'Prepare actions':'Autonomous'}</Button>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {toggles.map(toggle=><div key={toggle.key} className="flex items-center justify-between rounded-lg border bg-background/60 p-3"><span className="text-sm font-medium">{toggle.label}</span><Switch checked={toggle.value} onCheckedChange={checked=>updateSettings({[toggle.key]:checked} as Partial<Settings>)} disabled={settings?.mode==='review'}/></div>)}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary"/>High-impact actions still require explicit approval; every Operator action is recorded.</div>
    </CardContent></Card>

    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Potential recovery</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><DollarSign className="h-5 w-5"/>{money(scan?.recoveredPotential??0)}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Only amounts already stored in AgentHub are counted.</p></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Problems detected</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><AlertCircle className="h-5 w-5"/>{scan?.findings.length??0}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{highCount} high-priority issue{highCount===1?'':'s'}.</p></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Operator mode</CardDescription><CardTitle className="text-2xl">{settings?.mode==='autonomous'?'Autonomous':settings?.mode==='prepare'?'Prepare':'Review only'}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Last scan {scan?.scannedAt?new Date(scan.scannedAt).toLocaleString(): 'just now'}.</p></CardContent></Card></div>

    {scan?.findings.length===0?<Card><CardContent className="flex flex-col items-center justify-center py-14 text-center"><CheckCircle2 className="mb-3 h-10 w-10 text-primary"/><h2 className="text-lg font-semibold">No urgent business problems detected</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">AgentHub found no obvious recovery opportunities in the connected business data right now.</p></CardContent></Card>:<div className="space-y-3"><div><h2 className="text-lg font-semibold">What the Operator found</h2><p className="text-sm text-muted-foreground">Evidence-based findings from your existing AgentHub data.</p></div>{scan?.findings.map(f=>{const Icon=f.id==='stale-leads'?Users:f.id==='unpaid-orders'?DollarSign:f.id==='overdue-tasks'?Clock3:f.id==='quiet-conversations'?MessageSquareWarning:f.id==='cancelled-appointments'?CalendarX:PackageX;return <Card key={f.id}><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"><Icon className="h-5 w-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{f.title}</h3><Badge variant={f.severity==='high'?'destructive':'secondary'}>{f.severity}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{f.description}</p>{f.amount? <p className="mt-2 text-sm font-medium">{money(f.amount,f.currency)}</p>:null}</div>{f.actionType?<Button variant="outline" className="gap-2 shrink-0" onClick={()=>{const a=actions.find(x=>x.action_type===f.actionType);if(a) execute(a.id,a.status==='proposed'&&settings?.mode==='autonomous');else toast({title:'No action queued',description:'Enable Prepare actions or an automation permission, then run the scan again.'});}} disabled={scanning}>{f.actionType==='create_lead_followup'?'Queue lead recovery':f.actionType==='prepare_payment_reminder'?'Prepare payment reminders':'Create inventory alerts'}<ArrowRight className="h-4 w-4"/></Button>:null}</CardContent></Card>})}</div>}

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary"/>Action queue</CardTitle><CardDescription>Proposed, approved and completed Operator decisions. Nothing irreversible happens without permission.</CardDescription></CardHeader><CardContent className="space-y-3">{actions.length===0?<p className="text-sm text-muted-foreground">No queued actions. Run a scan with Prepare or Autonomous mode to generate actions.</p>:actions.slice(0,20).map(a=><div key={a.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{a.title}</p><Badge variant={a.status==='failed'?'destructive':a.status==='completed'?'default':'secondary'}>{a.status}</Badge><Badge variant="outline">{a.risk_level} risk</Badge></div><p className="mt-1 text-sm text-muted-foreground">{a.description||'Operator action'}</p>{a.error_message?<p className="mt-1 text-xs text-destructive">{a.error_message}</p>:null}</div>{['proposed','approved'].includes(a.status)?<div className="flex gap-2">{a.status==='proposed'&&a.risk_level!=='low'?<Button size="sm" variant="outline" disabled={busyAction===a.id} onClick={()=>api({action:'approve',action_id:a.id}).then(()=>refresh()).catch(e=>toast({title:'Approval failed',description:e.message,variant:'destructive'}))}>Approve</Button>:null}<Button size="sm" disabled={busyAction===a.id} onClick={()=>execute(a.id,a.status==='proposed')}>{busyAction===a.id?<Loader2 className="h-4 w-4 animate-spin"/>:'Execute'}</Button></div>:null}</div>)}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/>Safe automation</CardTitle><CardDescription>AgentHub does not silently send money, delete records, or make irreversible decisions. The Operator uses business-scoped permissions, idempotent actions and an activity trail.</CardDescription></CardHeader></Card>
  </div>;
}
