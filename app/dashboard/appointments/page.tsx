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
import { Plus, Calendar, ChevronLeft, ChevronRight, Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImportExportDialog } from '@/components/import-export-dialog';
import { type ColumnDef, type ImportRowError } from '@/lib/import-export/csv';
import { APPOINTMENT_STATUSES, type Appointment } from '@/lib/types/database';

const IMPORT_COLUMNS: ColumnDef[] = [
  { key: 'customer_name', label: 'Customer Name', required: true, type: 'text' },
  { key: 'date', label: 'Date (YYYY-MM-DD)', required: true, type: 'text' },
  { key: 'start_time', label: 'Start Time (HH:MM)', required: true, type: 'text' },
  { key: 'end_time', label: 'End Time (HH:MM)', required: true, type: 'text' },
  { key: 'notes', label: 'Notes', type: 'text' },
];

export default function AppointmentsPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [form, setForm] = useState({ customer_name: '', date: '', start_time: '09:00', end_time: '09:30', notes: '' });

  const fetchAppointments = async () => {
    if (!activeBusiness) return;
    const { data } = await supabase.from('appointments').select('*').eq('business_id', activeBusiness.id).order('date', { ascending: true });
    setAppointments(data as Appointment[] ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAppointments(); }, [activeBusiness]);

  const handleCreate = async () => {
    if (!activeBusiness) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('appointments').insert({
      business_id: activeBusiness.id, ...form, status: 'scheduled',
    }).select().maybeSingle();
    if (!error && data) {
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id, action: 'created_appointment', entity_type: 'appointment', entity_id: data.id,
      });
    }
    setSubmitting(false);
    setCreateOpen(false);
    setForm({ customer_name: '', date: '', start_time: '09:00', end_time: '09:30', notes: '' });
    await fetchAppointments();
    toast({ title: 'Appointment created' });
  };

  const updateStatus = async (apt: Appointment, newStatus: string) => {
    await supabase.from('appointments').update({ status: newStatus }).eq('id', apt.id);
    await fetchAppointments();
    toast({ title: 'Status updated' });
  };

  const monthAppointments = (date: string) => appointments.filter((a) => a.date === date);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading appointments...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{appointments.length} appointment{appointments.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIoOpen(true)}><Upload className="w-4 h-4" /> Import / Export</Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Create Appointment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule New Appointment</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Customer Name</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
                <div className="space-y-2"><Label>End Time</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting || !form.customer_name || !form.date}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {appointments.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><Calendar className="w-7 h-7 text-muted-foreground" /></div>
              <p className="text-sm text-muted-foreground">No appointments scheduled yet.</p>
            </CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Time</TableHead>
                  <TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead>Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {appointments.map((apt) => {
                    const statusInfo = APPOINTMENT_STATUSES.find((s) => s.value === apt.status);
                    return (
                      <TableRow key={apt.id}>
                        <TableCell className="font-medium">{apt.customer_name || 'Unknown'}</TableCell>
                        <TableCell>{apt.date}</TableCell>
                        <TableCell>{apt.start_time} - {apt.end_time}</TableCell>
                        <TableCell><Badge className={statusInfo?.color} variant="secondary">{statusInfo?.label ?? apt.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{apt.notes || '-'}</TableCell>
                        <TableCell>
                          <Select value={apt.status} onValueChange={(v) => updateStatus(apt, v)}>
                            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{APPOINTMENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <h3 className="text-lg font-semibold">{monthName}</h3>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayApts = monthAppointments(dateStr);
                  const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNum).toDateString();
                  return (
                    <div key={dayNum} className={`min-h-20 p-1 rounded-lg border ${isToday ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <p className="text-xs text-muted-foreground mb-1">{dayNum}</p>
                      {dayApts.slice(0, 2).map((a) => (
                        <div key={a.id} className="text-xs bg-primary/10 text-primary rounded px-1 py-0.5 mb-0.5 truncate">
                          {a.start_time} {a.customer_name || 'Unknown'}
                        </div>
                      ))}
                      {dayApts.length > 2 && <p className="text-xs text-muted-foreground">+{dayApts.length - 2} more</p>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        title="Appointments"
        columns={IMPORT_COLUMNS}
        exportFilename="appointments"
        onImport={async (rows) => {
          if (!activeBusiness) return { created: 0, skipped: 0, errors: [] };
          let created = 0, skipped = 0;
          const errors: ImportRowError[] = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            const timeRegex = /^\d{2}:\d{2}$/;
            if (!dateRegex.test(r.date)) { errors.push({ row: i + 2, field: 'date', message: 'Date must be YYYY-MM-DD format' }); continue; }
            if (!timeRegex.test(r.start_time) || !timeRegex.test(r.end_time)) { errors.push({ row: i + 2, field: 'time', message: 'Times must be HH:MM format' }); continue; }
            const { error } = await supabase.from('appointments').insert({
              business_id: activeBusiness.id,
              customer_name: r.customer_name,
              date: r.date,
              start_time: r.start_time,
              end_time: r.end_time,
              notes: r.notes || null,
              status: 'scheduled',
            });
            if (error) { errors.push({ row: i + 2, message: error.message }); } else { created++; }
          }
          await fetchAppointments();
          return { created, skipped, errors };
        }}
        onExport={async () => {
          if (!activeBusiness) return [];
          const { data } = await supabase.from('appointments').select('*').eq('business_id', activeBusiness.id).order('date', { ascending: true });
          return (data ?? []) as Record<string, unknown>[];
        }}
      />
    </div>
  );
}
