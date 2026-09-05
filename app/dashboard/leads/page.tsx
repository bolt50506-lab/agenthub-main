'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Users, Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ImportExportDialog } from '@/components/import-export-dialog';
import { type ColumnDef, type ImportRowError } from '@/lib/import-export/csv';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@/lib/types/database';

const IMPORT_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', required: true, type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'source', label: 'Source', type: 'text' },
  { key: 'interested_product', label: 'Interested Product', type: 'text' },
  { key: 'budget', label: 'Budget', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'requirement', label: 'Requirement', type: 'text' },
];

export default function LeadsPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: 'manual', interested_product: '',
    budget: '', location: '', requirement: '',
  });

  const fetchLeads = async () => {
    if (!activeBusiness) return;
    let query = supabase.from('leads').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data } = await query;
    setLeads(data as Lead[] ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [activeBusiness, statusFilter, search]);

  const handleCreate = async () => {
    if (!activeBusiness) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('leads').insert({
      business_id: activeBusiness.id,
      ...form,
      status: 'new',
    }).select().maybeSingle();
    if (!error && data) {
      await supabase.from('lead_activities').insert({
        lead_id: data.id,
        business_id: activeBusiness.id,
        activity_type: 'created',
        description: 'Lead created manually',
      });
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id,
        action: 'created_lead',
        entity_type: 'lead',
        entity_id: data.id,
      });
    }
    setSubmitting(false);
    setCreateOpen(false);
    setForm({ name: '', phone: '', email: '', source: 'manual', interested_product: '', budget: '', location: '', requirement: '' });
    await fetchLeads();
    toast({ title: 'Lead created', description: `${form.name} has been added.` });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading leads...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Filter by status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIoOpen(true)}><Upload className="w-4 h-4" /> Import / Export</Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Create Lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New Lead</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-2"><Label>Source</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Interested Product/Service</Label><Input value={form.interested_product} onChange={(e) => setForm({ ...form, interested_product: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Budget</Label><Input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
                <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Requirement</Label><Textarea value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting || !form.name}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">No leads found. Create one or let your AI agents capture them from conversations.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI Score</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Interested In</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const statusInfo = LEAD_STATUSES.find((s) => s.value === lead.status);
                const score = getLeadScore(lead);
                const heat = score >= 80 ? 'Hot' : score >= 60 ? 'Warm' : 'Cold';
                return (
                  <TableRow key={lead.id} className="cursor-pointer" onClick={() => window.location.href = `/dashboard/leads/${lead.id}`}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.phone || '-'}</TableCell>
                    <TableCell><Badge className={statusInfo?.color} variant="secondary">{statusInfo?.label ?? lead.status}</Badge></TableCell>
                    <TableCell><Badge variant={score >= 80 ? 'destructive' : score >= 60 ? 'default' : 'secondary'}>{heat} {score}/100</Badge></TableCell>
                    <TableCell className="text-muted-foreground capitalize">{lead.source}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.interested_product || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <ImportExportDialog
        open={ioOpen}
        onOpenChange={setIoOpen}
        title="Leads"
        columns={IMPORT_COLUMNS}
        exportFilename="leads"
        onImport={async (rows) => {
          if (!activeBusiness) return { created: 0, skipped: 0, errors: [] };
          let created = 0, skipped = 0;
          const errors: ImportRowError[] = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const { error } = await supabase.from('leads').insert({
              business_id: activeBusiness.id,
              name: r.name,
              phone: r.phone || null,
              email: r.email || null,
              source: r.source || 'manual',
              interested_product: r.interested_product || null,
              budget: r.budget || null,
              location: r.location || null,
              requirement: r.requirement || null,
              status: 'new' as LeadStatus,
            });
            if (error) { errors.push({ row: i + 2, message: error.message }); } else { created++; }
          }
          await fetchLeads();
          return { created, skipped, errors };
        }}
        onExport={async () => {
          if (!activeBusiness) return [];
          const { data } = await supabase.from('leads').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false });
          return (data ?? []) as Record<string, unknown>[];
        }}
      />
    </div>
  );
}

function getLeadScore(lead: Lead): number {
  if (lead.status === 'won') return 100;
  if (lead.status === 'lost') return 0;
  let score = 20;
  if (lead.status === 'contacted') score += 15;
  if (lead.status === 'qualified') score += 35;
  if (lead.status === 'appointment_booked') score += 45;
  if (lead.status === 'proposal') score += 55;
  if (lead.budget) score += 10;
  if (lead.interested_product) score += 10;
  if (lead.requirement) score += 10;
  if (lead.phone || lead.email) score += 5;
  return Math.min(score, 99);
}
