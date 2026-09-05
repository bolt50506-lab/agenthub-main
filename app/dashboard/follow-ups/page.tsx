'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckSquare, Check, X, Loader2, Bot, Clock3, Send, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FOLLOWUP_STATUSES, type FollowUpTask } from '@/lib/types/database';

const TASK_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'message', label: 'Message' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'custom', label: 'Custom' },
];

export default function FollowUpsPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [followUps, setFollowUps] = useState<FollowUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ task_type: 'call', scheduled_at: '', notes: '' });
  const [automation, setAutomation] = useState<any>(null);

  const fetchFollowUps = async () => {
    if (!activeBusiness) return;
    const { data } = await supabase.from('follow_up_tasks').select('*').eq('business_id', activeBusiness.id).order('scheduled_at', { ascending: true });
    setFollowUps(data as FollowUpTask[] ?? []);
    const { data: automationData } = await supabase.from('followup_automation_settings').select('*').eq('business_id', activeBusiness.id).maybeSingle();
    setAutomation(automationData);
    setLoading(false);
  };

  useEffect(() => { fetchFollowUps(); }, [activeBusiness]);

  const handleCreate = async () => {
    if (!activeBusiness) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('follow_up_tasks').insert({
      business_id: activeBusiness.id, task_type: form.task_type,
      scheduled_at: form.scheduled_at, notes: form.notes, status: 'pending',
    }).select().maybeSingle();
    if (!error && data) {
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id, action: 'created_followup', entity_type: 'follow_up', entity_id: data.id,
      });
    }
    setSubmitting(false);
    setCreateOpen(false);
    setForm({ task_type: 'call', scheduled_at: '', notes: '' });
    await fetchFollowUps();
    toast({ title: 'Follow-up created' });
  };

  const completeTask = async (task: FollowUpTask) => {
    if (!activeBusiness) return;
    await supabase.from('follow_up_tasks').update({ status: 'completed' }).eq('id', task.id);
    await supabase.from('follow_up_history').insert({
      follow_up_id: task.id, business_id: activeBusiness.id, action: 'completed', notes: 'Task completed',
    });
    await fetchFollowUps();
    toast({ title: 'Task completed' });
  };

  const cancelTask = async (task: FollowUpTask) => {
    if (!activeBusiness) return;
    await supabase.from('follow_up_tasks').update({ status: 'cancelled' }).eq('id', task.id);
    await supabase.from('follow_up_history').insert({
      follow_up_id: task.id, business_id: activeBusiness.id, action: 'cancelled', notes: 'Task cancelled',
    });
    await fetchFollowUps();
    toast({ title: 'Task cancelled' });
  };

  const now = new Date().toISOString();
  const upcoming = followUps.filter((f) => f.status === 'pending' && f.scheduled_at >= now);
  const automated = followUps.filter((f: any) => f.automation_generated);
  const completed = followUps.filter((f) => f.status === 'completed');
  const overdue = followUps.filter((f) => f.status === 'pending' && f.scheduled_at < now);

  const renderTable = (items: FollowUpTask[]) => {
    if (items.length === 0) {
      return (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><CheckSquare className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">No follow-ups in this view.</p>
        </CardContent></Card>
      );
    }
    return (
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Task Type</TableHead><TableHead>Scheduled</TableHead>
            <TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((fu) => {
              const statusInfo = FOLLOWUP_STATUSES.find((s) => s.value === fu.status);
              return (
                <TableRow key={fu.id}>
                  <TableCell className="font-medium capitalize">{fu.task_type}</TableCell>
                  <TableCell>{new Date(fu.scheduled_at).toLocaleString()}</TableCell>
                  <TableCell><Badge className={statusInfo?.color} variant="secondary">{statusInfo?.label ?? fu.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{fu.notes || '-'}</TableCell>
                  <TableCell>
                    {fu.status === 'pending' && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => completeTask(fu)} title="Complete"><Check className="w-4 h-4 text-green-600" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => cancelTask(fu)} title="Cancel"><X className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    );
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading follow-ups...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><div className="rounded-xl bg-primary/15 p-2"><Bot className="h-5 w-5 text-primary" /></div><Badge variant={automation?.enabled ? 'default' : 'secondary'}>{automation?.enabled ? 'Automation ON' : 'Automation OFF'}</Badge></div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Follow-up Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">Automatic WhatsApp follow-ups keep active leads engaged without manual chasing.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border bg-background/80 px-4 py-3"><p className="text-xl font-bold">{automated.length}</p><p className="text-xs text-muted-foreground">Automated</p></div>
            <div className="rounded-xl border bg-background/80 px-4 py-3"><p className="text-xl font-bold">{upcoming.length}</p><p className="text-xs text-muted-foreground">Upcoming</p></div>
            <div className="rounded-xl border bg-background/80 px-4 py-3"><p className="text-xl font-bold">{completed.length}</p><p className="text-xs text-muted-foreground">Completed</p></div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline" className="gap-1.5"><Clock3 className="h-3.5 w-3.5" /> First follow-up: {automation?.first_delay_hours ?? 24}h</Badge>
          <Badge variant="outline" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Channel: WhatsApp</Badge>
          {automation?.enabled ? <span className="text-muted-foreground">The worker checks due follow-ups automatically every 5 minutes.</span> : <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /> Automation is disabled, so no automatic messages will be sent.</span>}
          <Button variant="ghost" size="sm" onClick={fetchFollowUps} className="ml-auto gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{followUps.length} follow-up task{followUps.length !== 1 ? 's' : ''}</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Create Follow-up</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Follow-up Task</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Task Type</Label>
                <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Scheduled At</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting || !form.scheduled_at}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({followUps.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all">{renderTable(followUps)}</TabsContent>
        <TabsContent value="upcoming">{renderTable(upcoming)}</TabsContent>
        <TabsContent value="overdue">{renderTable(overdue)}</TabsContent>
      </Tabs>
    </div>
  );
}
