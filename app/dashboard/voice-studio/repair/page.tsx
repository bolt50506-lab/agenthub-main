'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, Mic2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Voice={id:string;name:string;provider:string;is_default:boolean;status:string};
const ACCEPT='audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,audio/m4a';

export default function VoiceRepairPage(){
 const {activeBusiness}=useAuth(); const {toast}=useToast(); const [voice,setVoice]=useState<Voice|null>(null); const [file,setFile]=useState<File|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
 useEffect(()=>{(async()=>{if(!activeBusiness)return;const {data:{session}}=await supabase.auth.getSession();const r=await fetch(`/api/voice/profiles?businessId=${encodeURIComponent(activeBusiness.id)}`,{headers:session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{}});const j=await r.json().catch(()=>({}));setVoice((j.voices||[]).find((v:Voice)=>v.name.toLowerCase()==='ali')||(j.voices||[]).find((v:Voice)=>v.is_default)||null);setLoading(false)})();},[activeBusiness?.id]);
 const repair=async()=>{if(!voice||!file)return;setSaving(true);const form=new FormData();form.set('file',file,file.name);const {data:{session}}=await supabase.auth.getSession();const r=await fetch(`/api/voice/profiles/${voice.id}`,{method:'PATCH',headers:session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{},body:form});const j=await r.json().catch(()=>({}));setSaving(false);if(!r.ok)return toast({title:'Voice repair failed',description:j.error||'Unable to update voice',variant:'destructive'});toast({title:'Ali voice repaired',description:'The existing OmniVoice profile was updated. No duplicate was created.'});setFile(null)};
 if(loading)return <div className="animate-pulse text-muted-foreground">Loading voice profile...</div>;
 return <div className="max-w-2xl space-y-6"><div><h2 className="text-2xl font-bold flex items-center gap-2"><Mic2 className="w-6 h-6"/>Repair existing voice</h2><p className="text-muted-foreground">Replace the reference recording of the existing Ali voice without creating another clone.</p></div><Card><CardHeader><CardTitle>{voice?`Existing voice: ${voice.name}`:'Ali voice not found'}</CardTitle></CardHeader><CardContent className="space-y-4">{voice?<><div className="rounded-lg border p-4 text-sm">Provider: <strong>{voice.provider}</strong> · Status: <strong>{voice.status}</strong>{voice.is_default?' · Default':''}</div><Input type="file" accept={ACCEPT} onChange={e=>setFile(e.target.files?.[0]||null)} disabled={saving}/>{file&&<p className="text-sm text-muted-foreground">Selected: {file.name}</p>}<Button onClick={repair} disabled={!file||saving} className="gap-2">{saving?<Loader2 className="w-4 h-4 animate-spin"/>:<Upload className="w-4 h-4"/>}{saving?'Repairing voice...':'Replace reference & repair'}</Button></>:<p className="text-sm text-muted-foreground">No OmniVoice profile named Ali (or default voice) is available for this business.</p>}</CardContent></Card></div>;
}
