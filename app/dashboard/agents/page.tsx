'use client';

import { useEffect, useState } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Bot, Plus, MoreVertical, Trash2, Edit, Play, Pause, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Agent } from '@/lib/types/database';

const PROVIDERS = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'groq', label: 'Groq' },
  { value: 'ollama', label: 'Ollama (Local)' },
];

export default function AgentsPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '', purpose: 'Sales', description: '', communication_style: 'professional',
    primary_goal: 'sales', supported_languages: 'English', ai_provider: 'gemini',
  });

  useEffect(() => {
    if (!activeBusiness) return;
    (async () => {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('business_id', activeBusiness.id)
        .order('created_at', { ascending: false });
      setAgents(data as Agent[] ?? []);
      setLoading(false);
    })();
  }, [activeBusiness]);

  const fetchAgents = async () => {
    if (!activeBusiness) return;
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('business_id', activeBusiness.id)
      .order('created_at', { ascending: false });
    setAgents(data as Agent[] ?? []);
  };

  const handleCreate = async () => {
    if (!activeBusiness) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from('agents')
      .insert({
        business_id: activeBusiness.id,
        name: form.name,
        purpose: form.purpose,
        description: form.description,
        communication_style: form.communication_style,
        primary_goal: form.primary_goal,
        supported_languages: form.supported_languages.split(',').map((l) => l.trim()).filter(Boolean),
        ai_provider: form.ai_provider,
        status: 'active',
        enabled_capabilities: ['search_knowledge', 'search_products'],
      })
      .select()
      .maybeSingle();

    if (data && !error) {
      await supabase.from('agent_settings').insert({
        agent_id: data.id,
        business_id: activeBusiness.id,
        tone: form.communication_style,
      });
      await supabase.from('activity_logs').insert({
        business_id: activeBusiness.id,
        action: 'created_agent',
        entity_type: 'agent',
        entity_id: data.id,
      });
    }

    setSubmitting(false);
    setCreateOpen(false);
    setForm({ name: '', purpose: 'Sales', description: '', communication_style: 'professional', primary_goal: 'sales', supported_languages: 'English', ai_provider: 'gemini' });
    await fetchAgents();
    toast({ title: 'Agent created', description: `${form.name} is now active.` });
  };

  const toggleStatus = async (agent: Agent) => {
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    await supabase.from('agents').update({ status: newStatus }).eq('id', agent.id);
    await fetchAgents();
    toast({ title: `Agent ${newStatus === 'active' ? 'activated' : 'paused'}` });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('agents').delete().eq('id', deleteId);
    setDeleteId(null);
    await fetchAgents();
    toast({ title: 'Agent deleted' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading agents...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{agents.length} agent{agents.length !== 1 ? 's' : ''}</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Create Agent</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New AI Agent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Agent Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer Support Agent" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Input id="purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Sales, Support, etc." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Communication Style</Label>
                  <Select value={form.communication_style} onValueChange={(v) => setForm({ ...form, communication_style: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>AI Provider</Label>
                  <Select value={form.ai_provider} onValueChange={(v) => setForm({ ...form, ai_provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="languages">Supported Languages (comma-separated)</Label>
                <Input id="languages" value={form.supported_languages} onChange={(e) => setForm({ ...form, supported_languages: e.target.value })} placeholder="English, Spanish" />
              </div>
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

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">No AI agents yet. Create your first agent to start automating conversations.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader className="flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.status === 'active' ? 'bg-green-50 dark:bg-green-950/30' : 'bg-muted'}`}>
                    <Bot className={`w-5 h-5 ${agent.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{agent.purpose}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/agents/${agent.id}`}><Edit className="w-4 h-4 mr-2" /> Edit</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleStatus(agent)}>
                      {agent.status === 'active' ? <><Pause className="w-4 h-4 mr-2" /> Pause</> : <><Play className="w-4 h-4 mr-2" /> Activate</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(agent.id)}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="capitalize">{agent.status}</Badge>
                  <span className="text-xs text-muted-foreground">{agent.enabled_capabilities.length} capabilities</span>
                </div>
                {agent.description && <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>}
                <div className="flex flex-wrap gap-1 mt-3">
                  {agent.supported_languages.map((lang) => (
                    <Badge key={lang} variant="outline" className="text-xs">{lang}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The agent and its settings will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
