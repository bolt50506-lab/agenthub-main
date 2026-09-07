'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, MessageSquare, Facebook, Instagram } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Mode = 'text_only' | 'voice_only' | 'random';
type Channel = 'whatsapp' | 'facebook_messenger' | 'instagram';

type ChannelConfig = {
  mode: Mode;
  fallbackEnabled: boolean;
  fallbackTimeoutSeconds: number;
};

const channels: Array<{ id: Channel; label: string; description: string; icon: typeof MessageSquare }> = [
  { id: 'whatsapp', label: 'WhatsApp', description: 'One reply per customer message: text or voice.', icon: MessageSquare },
  { id: 'facebook_messenger', label: 'Facebook Messenger', description: 'One reply per customer message for connected Pages.', icon: Facebook },
  { id: 'instagram', label: 'Instagram', description: 'One reply per customer message for connected DMs.', icon: Instagram },
];

const labels: Record<Mode, string> = {
  text_only: 'Text only',
  voice_only: 'Voice only',
  random: 'Random: Text or Voice',
};

const defaults: Record<Channel, ChannelConfig> = {
  whatsapp: { mode: 'text_only', fallbackEnabled: true, fallbackTimeoutSeconds: 20 },
  facebook_messenger: { mode: 'text_only', fallbackEnabled: true, fallbackTimeoutSeconds: 20 },
  instagram: { mode: 'text_only', fallbackEnabled: true, fallbackTimeoutSeconds: 20 },
};

export default function ReplyFormatPage() {
  const { activeBusiness, activeMembership } = useAuth();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<Channel, ChannelConfig>>(defaults);
  const [saving, setSaving] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const canManage = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  useEffect(() => {
    if (!activeBusiness?.id) return;
    (async () => {
      const { data } = await supabase.from('integrations').select('type, config').eq('business_id', activeBusiness.id).in('type', ['whatsapp', 'facebook_messenger', 'instagram']);
      const next = {
        whatsapp: { ...defaults.whatsapp },
        facebook_messenger: { ...defaults.facebook_messenger },
        instagram: { ...defaults.instagram },
      } as Record<Channel, ChannelConfig>;
      for (const row of data || []) {
        const type = row.type as Channel;
        const config = (row.config || {}) as Record<string, unknown>;
        const rawMode = config.voice_reply_mode;
        if (rawMode === 'text_only' || rawMode === 'voice_only' || rawMode === 'random') next[type].mode = rawMode;
        else if (rawMode === 'text_and_voice' || rawMode === 'disabled') next[type].mode = 'text_only';
        next[type].fallbackEnabled = config.voice_clone_fallback_enabled !== false;
        const timeout = Number(config.voice_clone_fallback_timeout_seconds);
        if (Number.isFinite(timeout)) next[type].fallbackTimeoutSeconds = Math.min(60, Math.max(5, Math.round(timeout)));
      }
      setValues(next);
      setLoading(false);
    })();
  }, [activeBusiness?.id]);

  async function save(channel: Channel) {
    if (!activeBusiness?.id || !canManage) return;
    setSaving(channel);
    const current = values[channel];
    const { data: existing } = await supabase.from('integrations').select('id, config').eq('business_id', activeBusiness.id).eq('type', channel).maybeSingle();
    if (!existing) {
      toast({ title: 'Channel not connected', description: `Connect ${channels.find((c) => c.id === channel)?.label} first.`, variant: 'destructive' });
      setSaving(null);
      return;
    }
    const config = {
      ...((existing.config || {}) as Record<string, unknown>),
      voice_reply_mode: current.mode,
      voice_clone_fallback_enabled: current.fallbackEnabled,
      voice_clone_fallback_timeout_seconds: current.fallbackTimeoutSeconds,
    };
    const { error } = await supabase.from('integrations').update({ config }).eq('id', existing.id);
    setSaving(null);
    if (error) {
      toast({ title: 'Could not save reply settings', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reply settings saved', description: `${channels.find((c) => c.id === channel)?.label}: ${labels[current.mode]}` });
  }

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading reply settings...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Reply Format</h2>
        <p className="mt-1 text-muted-foreground">Each customer message gets one reply: text, voice, or a random choice.</p>
      </div>

      <div className="grid gap-4">
        {channels.map((channel) => {
          const Icon = channel.icon;
          const config = values[channel.id];
          return (
            <Card key={channel.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{channel.label}</CardTitle>
                    <CardDescription>{channel.description}</CardDescription>
                  </div>
                  <Badge variant={config.mode === 'voice_only' ? 'default' : 'secondary'}>{labels[config.mode]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium">Reply format</p>
                    <Select value={config.mode} onValueChange={(value) => setValues((current) => ({ ...current, [channel.id]: { ...current[channel.id], mode: value as Mode } }))} disabled={!canManage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text_only">Text only</SelectItem>
                        <SelectItem value="voice_only">Voice only</SelectItem>
                        <SelectItem value="random">Random: Text or Voice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => save(channel.id)} disabled={!canManage || saving === channel.id} className="gap-2">
                    {saving === channel.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </Button>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">TTS fallback</p>
                      <p className="text-xs text-muted-foreground">If the cloned OmniVoice cannot generate the selected voice reply, use the configured fallback TTS.</p>
                    </div>
                    <Switch checked={config.fallbackEnabled} onCheckedChange={(checked) => setValues((current) => ({ ...current, [channel.id]: { ...current[channel.id], fallbackEnabled: checked } }))} disabled={!canManage} />
                  </div>
                  {config.fallbackEnabled && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground">Fallback wait</label>
                      <Select value={String(config.fallbackTimeoutSeconds)} onValueChange={(value) => setValues((current) => ({ ...current, [channel.id]: { ...current[channel.id], fallbackTimeoutSeconds: Number(value) } }))} disabled={!canManage}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 sec</SelectItem>
                          <SelectItem value="10">10 sec</SelectItem>
                          <SelectItem value="15">15 sec</SelectItem>
                          <SelectItem value="20">20 sec</SelectItem>
                          <SelectItem value="30">30 sec</SelectItem>
                          <SelectItem value="45">45 sec</SelectItem>
                          <SelectItem value="60">60 sec</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Text and voice are never sent together. Voice mode sends the cloned OmniVoice reply when available. TTS fallback is optional and only activates when cloning fails or times out.
        </CardContent>
      </Card>
    </div>
  );
}
