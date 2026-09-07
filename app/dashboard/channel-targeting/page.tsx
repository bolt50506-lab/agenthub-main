'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Save, MessageCircle, Facebook, Instagram, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Channel = 'whatsapp' | 'facebook_messenger' | 'instagram';
type Target = { id: string; name: string; username?: string | null; type: 'group' | 'page' | 'instagram' };

const CHANNELS: Array<{ id: Channel; label: string; icon: typeof MessageCircle; description: string }> = [
  { id: 'whatsapp', label: 'WhatsApp groups', icon: MessageCircle, description: 'Choose which WhatsApp groups this agent may answer. Direct/private chats are unaffected.' },
  { id: 'facebook_messenger', label: 'Facebook Pages', icon: Facebook, description: 'Choose which connected Facebook Pages should use this agent.' },
  { id: 'instagram', label: 'Instagram accounts', icon: Instagram, description: 'Choose which connected Instagram professional accounts should use this agent.' },
];

export default function ChannelTargetingPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current = useMemo(() => CHANNELS.find((item) => item.id === channel)!, [channel]);

  async function loadTargets() {
    if (!activeBusiness?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/integrations/targets?business_id=${encodeURIComponent(activeBusiness.id)}&channel=${channel}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not load targets');
      setTargets(Array.isArray(data.targets) ? data.targets : []);
      setSelected(Array.isArray(data.selected_ids) ? data.selected_ids : []);
      setMode(data.target_mode === 'selected' ? 'selected' : 'all');
      if (data.error) setError(data.error);
    } catch (err) {
      setTargets([]);
      setSelected([]);
      setError(err instanceof Error ? err.message : 'Could not load targets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTargets(); }, [activeBusiness?.id, channel]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
    setMode('selected');
  }

  function selectAll() {
    setMode('all');
    setSelected([]);
  }

  async function save() {
    if (!activeBusiness?.id) return;
    if (mode === 'selected' && selected.length === 0) {
      toast({ title: 'Select a target', description: 'Choose at least one target or use All.' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/integrations/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: activeBusiness.id, channel, target_mode: mode, selected_ids: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not save targeting');
      toast({ title: 'Targeting saved', description: mode === 'all' ? `${current.label}: All selected.` : `${selected.length} target${selected.length === 1 ? '' : 's'} selected.` });
      await loadTargets();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Could not save targeting', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Channel Targeting</h2>
        <p className="text-muted-foreground mt-1">After a channel is connected, choose exactly where the agent is allowed to operate.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {CHANNELS.map((item) => {
          const Icon = item.icon;
          const active = item.id === channel;
          return (
            <Button key={item.id} variant={active ? 'default' : 'outline'} className="h-auto justify-start gap-3 p-4 text-left" onClick={() => setChannel(item.id)}>
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><current.icon className="h-5 w-5" />{current.label}</CardTitle>
              <CardDescription className="mt-1">{current.description}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadTargets} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={selectAll} className={`rounded-lg border p-4 text-left transition-colors ${mode === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
              <div className="flex items-center gap-3"><Checkbox checked={mode === 'all'} onCheckedChange={selectAll} /><div><div className="font-medium">All</div><div className="text-xs text-muted-foreground">Use the agent on every connected {channel === 'whatsapp' ? 'group' : channel === 'facebook_messenger' ? 'Page' : 'Instagram account'}.</div></div></div>
            </button>
            <button type="button" onClick={() => setMode('selected')} className={`rounded-lg border p-4 text-left transition-colors ${mode === 'selected' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
              <div className="flex items-center gap-3"><Checkbox checked={mode === 'selected'} onCheckedChange={(checked) => setMode(checked ? 'selected' : 'all')} /><div><div className="font-medium">Selected only</div><div className="text-xs text-muted-foreground">The agent responds only in the targets you tick below.</div></div></div>
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading connected targets…</div>
          ) : targets.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No targets found</p><p className="mt-1 text-sm text-muted-foreground">Connect {channel === 'whatsapp' ? 'WhatsApp and make sure the session is connected' : channel === 'facebook_messenger' ? 'a Facebook Page' : 'an Instagram professional account'} first.</p></div>
          ) : (
            <div className="space-y-2">
              {targets.map((target) => {
                const checked = mode === 'selected' && selected.includes(target.id);
                return (
                  <label key={target.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${checked ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
                    <Checkbox checked={checked} disabled={mode === 'all'} onCheckedChange={(value) => toggle(target.id, value === true)} />
                    <div className="min-w-0 flex-1"><div className="font-medium truncate">{target.name}</div><div className="text-xs text-muted-foreground truncate">{target.id}{target.username ? ` · @${target.username}` : ''}</div></div>
                    <Badge variant="outline">{target.type === 'group' ? 'Group' : target.type === 'page' ? 'Page' : 'Instagram'}</Badge>
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <p className="text-sm text-muted-foreground">{mode === 'all' ? 'All connected targets are enabled.' : `${selected.length} target${selected.length === 1 ? '' : 's'} selected.`}</p>
            <Button onClick={save} disabled={saving || loading} className="gap-2"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save targeting'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
