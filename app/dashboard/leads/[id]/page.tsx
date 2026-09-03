'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Plus, Clock, CalendarPlus, BellPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LEAD_STATUSES, type Lead, type LeadNote, type LeadActivity, type Appointment, type FollowUpTask } from '@/lib/types/database';

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpTask[]>([]);
  const [showApptForm, setShowApptForm] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [apptForm, setApptForm] = useState({ date: '', start_time: '', end_time: '', notes: '' });
  const [followUpForm, setFollowUpForm] = useState({ scheduled_at: '', task_type: 'call', notes: '' });

  const fetchAll = async () => {
    if (!id) return;
    const { data: leadData } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
    setLead(leadData as Lead | null);
    const { data: notesData } = await supabase.from('lead_notes').select('*').eq('lead_id', id).order('created_at', { ascending: false });
    setNotes(notesData as LeadNote[] ?? []);
    const { data: actsData } = await supabase.from('lead_activities').select('*').eq('lead_id', id).order('created_at', { ascending: false });
    setActivities(actsData as LeadActivity[] ?? []);
    const { data: apptsData } = await supabase.from('appointments').select('*').eq('lead_id', id).order('date', { ascending: false });
    setAppointments(apptsData as Appointment[] ?? []);
    const { data: fuData } = await supabase.from('follow_up_tasks').select('*').eq('lead_id', id).order('scheduled_at', { ascending: false });
    setFollowUps(fuData as FollowUpTask[] ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const handleSave = async () => {
    if (!lead || !activeBusiness) return;
    setSaving(true);
    await supabase.from('leads').update({
      name: lead.name, phone: lead.phone, email: lead.email, source: lead.source,
      interested_product: lead.interested_product, budget: lead.budget, location: lead.location,
      requirement: lead.requirement, conversation_summary: lead.conversation_summary,
    }).eq('id', lead.id);
    await supabase.from('activity_logs').insert({
      business_id: activeBusiness.id, action: 'updated_lead', entity_type: 'lead', entity_id: lead.id,
    });
    setSaving(false);
    toast({ title: 'Lead saved' });
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!lead || !activeBusiness) return;
    const oldStatus = lead.status;
    setLead({ ...lead, status: newStatus as Lead['status'] });
    await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id);
    await supabase.from('lead_activities').insert({
      lead_id: lead.id, business_id: activeBusiness.id, activity_type: 'status_change',
      description: `Status changed from ${oldStatus} to ${newStatus}`,
    });
    await fetchAll();
    toast({ title: 'Status updated', description: `Lead is now ${newStatus}` });
  };

  const handleAddNote = async () => {
    if (!lead || !activeBusiness || !newNote.trim()) return;
    await supabase.from('lead_notes').insert({
      lead_id: lead.id, business_id: activeBusiness.id, content: newNote,
    });
    setNewNote('');
    await fetchAll();
    toast({ title: 'Note added' });
  };

  const handleCreateAppointment = async () => {
    if (!lead || !activeBusiness) return;
    if (!apptForm.date || !apptForm.start_time) {
      toast({ title: 'Missing fields', description: 'Date and start time are required.', variant: 'destructive' });
      return;
    }
    const { data } = await supabase.from('appointments').insert({
      business_id: activeBusiness.id,
      lead_id: lead.id,
      customer_id: lead.customer_id,
      customer_name: lead.name,
      date: apptForm.date,
      start_time: apptForm.start_time,
      end_time: apptForm.end_time || apptForm.start_time,
      status: 'scheduled',
      notes: apptForm.notes || null,
    }).select().maybeSingle();

    if (data) {
      await supabase.from('lead_activities').insert({
        lead_id: lead.id, business_id: activeBusiness.id, activity_type: 'appointment_created',
        description: `Appointment scheduled for ${apptForm.date} at ${apptForm.start_time}`,
      });
      await supabase.from('leads').update({ status: 'appointment_booked' }).eq('id', lead.id);
    }
    setApptForm({ date: '', start_time: '', end_time: '', notes: '' });
    setShowApptForm(false);
    await fetchAll();
    toast({ title: 'Appointment created' });
  };

  const handleCreateFollowUp = async () => {
    if (!lead || !activeBusiness) return;
    if (!followUpForm.scheduled_at) {
      toast({ title: 'Missing fields', description: 'Scheduled date/time is required.', variant: 'destructive' });
      return;
    }
    const { data } = await supabase.from('follow_up_tasks').insert({
      business_id: activeBusiness.id,
      lead_id: lead.id,
      task_type: followUpForm.task_type,
      scheduled_at: followUpForm.scheduled_at,
      status: 'pending',
      notes: followUpForm.notes || null,
    }).select().maybeSingle();

    if (data) {
      await supabase.from('lead_activities').insert({
        lead_id: lead.id, business_id: activeBusiness.id, activity_type: 'followup_created',
        description: `Follow-up (${followUpForm.task_type}) scheduled for ${followUpForm.scheduled_at}`,
      });
    }
    setFollowUpForm({ scheduled_at: '', task_type: 'call', notes: '' });
    setShowFollowUpForm(false);
    await fetchAll();
    toast({ title: 'Follow-up scheduled' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading lead...</div>;
  if (!lead) return <div className="text-muted-foreground">Lead not found.</div>;

  const statusInfo = LEAD_STATUSES.find((s) => s.value === lead.status);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/leads" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Leads
        </Link>
        <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-2" /> Save</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Lead Information</CardTitle>
              <Badge className={statusInfo?.color} variant="secondary">{statusInfo?.label ?? lead.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Name</Label><Input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={lead.status} onValueChange={handleStatusChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Phone</Label><Input value={lead.phone ?? ''} onChange={(e) => setLead({ ...lead, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Email</Label><Input value={lead.email ?? ''} onChange={(e) => setLead({ ...lead, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Source</Label><Input value={lead.source} onChange={(e) => setLead({ ...lead, source: e.target.value })} /></div>
                <div className="space-y-2"><Label>Interested Product</Label><Input value={lead.interested_product ?? ''} onChange={(e) => setLead({ ...lead, interested_product: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Budget</Label><Input value={lead.budget ?? ''} onChange={(e) => setLead({ ...lead, budget: e.target.value })} /></div>
                <div className="space-y-2"><Label>Location</Label><Input value={lead.location ?? ''} onChange={(e) => setLead({ ...lead, location: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Requirement</Label><Textarea value={lead.requirement ?? ''} onChange={(e) => setLead({ ...lead, requirement: e.target.value })} rows={2} /></div>
              <div className="space-y-2"><Label>Conversation Summary</Label><Textarea value={lead.conversation_summary ?? ''} onChange={(e) => setLead({ ...lead, conversation_summary: e.target.value })} rows={3} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." onKeyDown={(e) => e.key === 'Enter' && handleAddNote()} />
                <Button onClick={handleAddNote} size="icon"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No notes yet.</p>
                ) : notes.map((note) => (
                  <div key={note.id} className="p-3 rounded-lg border border-border">
                    <p className="text-sm">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(note.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Appointments</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowApptForm(!showApptForm)}>
                <CalendarPlus className="w-4 h-4 mr-1.5" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {showApptForm && (
                <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={apptForm.date} onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Start Time</Label><Input type="time" value={apptForm.start_time} onChange={(e) => setApptForm({ ...apptForm, start_time: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">End Time</Label><Input type="time" value={apptForm.end_time} onChange={(e) => setApptForm({ ...apptForm, end_time: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Notes</Label><Input value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} placeholder="Optional notes" /></div>
                  <Button size="sm" onClick={handleCreateAppointment}>Create Appointment</Button>
                </div>
              )}
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">No appointments yet.</p>
              ) : appointments.map((appt) => (
                <div key={appt.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{appt.date} at {appt.start_time}</span>
                    <Badge variant="secondary" className="text-xs capitalize">{appt.status}</Badge>
                  </div>
                  {appt.notes && <p className="text-xs text-muted-foreground mt-1">{appt.notes}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Follow-ups</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowFollowUpForm(!showFollowUpForm)}>
                <BellPlus className="w-4 h-4 mr-1.5" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {showFollowUpForm && (
                <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Type</Label>
                      <Select value={followUpForm.task_type} onValueChange={(v) => setFollowUpForm({ ...followUpForm, task_type: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="message">Message</SelectItem>
                          <SelectItem value="visit">Visit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Scheduled At</Label><Input type="datetime-local" value={followUpForm.scheduled_at} onChange={(e) => setFollowUpForm({ ...followUpForm, scheduled_at: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Notes</Label><Input value={followUpForm.notes} onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })} placeholder="Optional notes" /></div>
                  <Button size="sm" onClick={handleCreateFollowUp}>Schedule Follow-up</Button>
                </div>
              )}
              {followUps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">No follow-ups yet.</p>
              ) : followUps.map((fu) => (
                <div key={fu.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{fu.task_type} — {new Date(fu.scheduled_at).toLocaleString()}</span>
                    <Badge variant="secondary" className="text-xs capitalize">{fu.status}</Badge>
                  </div>
                  {fu.notes && <p className="text-xs text-muted-foreground mt-1">{fu.notes}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No activity yet.</p>
            ) : (
              <div className="space-y-4">
                {activities.map((act) => (
                  <div key={act.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium capitalize">{act.activity_type.replace(/_/g, ' ')}</p>
                      {act.description && <p className="text-xs text-muted-foreground">{act.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(act.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
