'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, MessageSquare, Facebook, Instagram } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Mode = 'disabled' | 'text_only' | 'voice_only' | 'text_and_voice' | 'random';
type Channel = 'whatsapp' | 'facebook_messenger' | 'instagram';

const channels: Array<{ id: Channel; label: string; description: string; icon: typeof MessageSquare }> = [
  { id: 'whatsapp', label: 'WhatsApp', description: 'Uses the existing WhatsApp text/audio delivery system.', icon: MessageSquare },
  { id: 'facebook_messenger', label: 'Facebook Messenger', description: 'Controls AI replies for connected Facebook Pages.', icon: Facebook },
  { id: 'instagram', label: 'Instagram', description: 'Controls AI replies for connected Instagram DMs.', icon: Instagram },
];

const labels: Record<Mode, string> = {
  disabled: 'Text only (voice disabled)',
  text_only: 'Text only',
  voice_only: 'Audio only',
  text_and_voice: 'Text + Audio',
  random: 'Random: Text or Audio',
};

export default function ReplyFormatPage() {
  const { activeBusiness, activeMembership } = useAuth();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<Channel, Mode>>({ whatsapp: 'text_and_voice', facebook_messenger: 'text_and_voice', instagram: 'text_and_voice' });
  const [saving, setSaving] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const canManage = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  useEffect(() => {
    if (!activeBusiness?.id) return;
    (async () => {
      const { data } = await supabase.from('integrations').select('type, config').eq('business_id', activeBusiness.id).in('type', ['whatsapp', 'facebook_messenger', 'instagram']);
      const next = { whatsapp: 'text_and_voice', facebook_messenger: 'text_and_voice', instagram: 'text_and_voice' } as Record<Channel, Mode>;
      for (const row of data || []) {
        const type = row.type as Channel;
        const mode = (row.config as Record<string, unknown> | null)?.voice_reply_mode;
        if (mode === 'disabled' || mode === 'text_only' || mode === 'voice_only' || mode === 'text_and_voice' || mode === 'random') next[type] = mode;
      }
      setValues(next);
      setLoading(false);
    })();
  }, [activeBusiness?.id]);

  async function save(channel: Channel) {
    if (!activeBusiness?.id || !canManage) return;
    setSaving(channel);
    const mode = values[channel];
    const { data: existing } = await supabase.from('integrations').select('id, config').eq('business_id', activeBusiness.id).eq('type', channel).maybeSingle();
    if (!existing) {
      toast({ title: 'Channel not connected', description: `Connect ${channels.find((c) => c.id === channel)?.label} first.`, variant: 'destructive' });
      setSaving(null);
      return;
    }
    const config = { ...((existing.config || {}) as Record<string, unknown>), voice_reply_mode: mode };
    const { error } = await supabase.from('integrations').update({ config }).eq('id', existing.id);
    setSaving(null);
    if (error) {
      toast({ title: 'Could not save reply format', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reply format saved', description: `${channels.find((c) => c.id === channel)?.label}: ${labels[mode]}` });
  }

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading reply settings...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Reply Format</h2>
        <p className="mt-1 text-muted-foreground">Choose whether each connected channel replies with text, audio, or both.</p>
      </div>

      <div className="grid gap-4">
        {channels.map((channel) => {
          const Icon = channel.icon;
          const mode = values[channel.id];
          return (
            <Card key={channel.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{channel.label}</CardTitle>
                    <CardDescription>{channel.description}</CardDescription>
                  </div>
                  <Badge variant={mode === 'voice_only' || mode === 'text_and_voice' ? 'default' : 'secondary'}>{labels[mode]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Reply format</p>
                  <Select value={mode} onValueChange={(value) => setValues((current) => ({ ...current, [channel.id]: value as Mode }))} disabled={!canManage}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text_only">Text only</SelectItem>
                      <SelectItem value="voice_only">Audio only</SelectItem>
                      <SelectItem value="text_and_voice">Text + Audio</SelectItem>
                      <SelectItem value="random">Random: Text or Audio</SelectItem>
                      <SelectItem value="disabled">Text only (voice disabled)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => save(channel.id)} disabled={!canManage || saving === channel.id} className="gap-2">
                  {saving === channel.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Audio delivery on Facebook Messenger and Instagram requires an active AgentHub voice profile/provider. If no active voice is configured, the system safely falls back to text instead of sending a broken audio message.
        </CardContent>
      </Card>
    </div>
  );
}
