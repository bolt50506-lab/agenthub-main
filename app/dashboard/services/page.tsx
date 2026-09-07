'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, BriefcaseBusiness } from 'lucide-react';

type Service = { id:string; name:string; description:string|null; price:number|null; currency:string; duration_minutes:number|null; advance_required:number; status:string };

export default function ServicesPage() {
  const { activeBusiness } = useAuth();
  const [items,setItems]=useState<Service[]>([]); const [open,setOpen]=useState(false);
  const [form,setForm]=useState({name:'',description:'',price:'',currency:'PKR',duration_minutes:'60',advance_required:'0'});
  const load=async()=>{ if(!activeBusiness)return; const {data}=await supabase.from('services').select('*').eq('business_id',activeBusiness.id).order('created_at',{ascending:false}); setItems((data||[]) as Service[]); };
  useEffect(()=>{load();},[activeBusiness]);
  const save=async()=>{ if(!activeBusiness||!form.name.trim())return; await supabase.from('services').insert({business_id:activeBusiness.id,name:form.name.trim(),description:form.description||null,price:form.price?Number(form.price):null,currency:form.currency||'PKR',duration_minutes:form.duration_minutes?Number(form.duration_minutes):null,advance_required:Number(form.advance_required||0),status:'active'}); setOpen(false); setForm({name:'',description:'',price:'',currency:'PKR',duration_minutes:'60',advance_required:'0'}); load(); };
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><p className="text-muted-foreground">Define bookable services, prices and required advances.</p></div><Button onClick={()=>setOpen(true)}><Plus className="mr-2 h-4 w-4"/>Add Service</Button></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(s=><Card key={s.id}><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BriefcaseBusiness className="h-4 w-4"/>{s.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="text-muted-foreground">{s.description||'No description'}</p><div className="flex justify-between"><span>Price</span><strong>{s.price==null?'On request':s.currency+' '+Number(s.price).toLocaleString()}</strong></div><div className="flex justify-between"><span>Advance</span><strong>{s.currency+' '+Number(s.advance_required||0).toLocaleString()}</strong></div><div className="flex justify-between"><span>Duration</span><strong>{s.duration_minutes? s.duration_minutes+' min':'-'}</strong></div></CardContent></Card>)}</div>
    {!items.length&&<Card><CardContent className="py-14 text-center text-muted-foreground">No services yet. Add services so appointments can record the exact service and price.</CardContent></Card>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Add Service</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Name</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><Label>Description</Label><Textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div><div className="grid grid-cols-2 gap-3"><div><Label>Price</Label><Input type="number" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></div><div><Label>Currency</Label><Input value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></div><div><Label>Duration (minutes)</Label><Input type="number" value={form.duration_minutes} onChange={e=>setForm({...form,duration_minutes:e.target.value})}/></div><div><Label>Advance Required</Label><Input type="number" value={form.advance_required} onChange={e=>setForm({...form,advance_required:e.target.value})}/></div></div></div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save}>Save Service</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}