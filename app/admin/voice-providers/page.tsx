'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Mic2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type VoiceProvider = {
  id: string;
  provider: string;
  display_name: string;
  api_key_encrypted: string | null;
  base_url: string;
  model: string;
  is_enabled: boolean;
};

export default function VoiceProvidersPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<VoiceProvider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/voice-provider-config', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast({ title: 'Unable to load voice provider', description: result.error || 'Please try again', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const provider = (result.providers || []).find((item: VoiceProvider) => item.provider === 'elevenlabs') || null;
      setConfig(provider);
      setLoading(false);
    })();
  }, [toast]);

  const save = async () => {
    if (!config) return;
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/admin/voice-provider-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        configId: config.id,
        apiKey,
        baseUrl: config.base_url,
        model: config.model,
        displayName: config.display_name,
        isEnabled: config.is_enabled,
      }),
    });

    const result = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      toast({ title: 'Save failed', description: result.error || 'Unable to save provider', variant: 'destructive' });
      return;
    }

    setApiKey('');
    setConfig({ ...config, api_key_encrypted: config.api_key_encrypted || 'configured' });
    toast({ title: 'Voice provider saved' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading voice provider...</div>;
  if (!config) return <div className="text-muted-foreground">Voice provider configuration is unavailable.</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Voice Providers</h2>
        <p className="text-muted-foreground">Configure the provider used for business voice cloning and cloned AI voice replies.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mic2 className="w-5 h-5" /> {config.display_name}</CardTitle>
          <CardDescription>API credentials remain server-side. Business users never see the provider API key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Enable voice cloning</p>
              <p className="text-sm text-muted-foreground">Businesses can only create clones while this provider is enabled.</p>
            </div>
            <Switch checked={config.is_enabled} onCheckedChange={(value) => setConfig({ ...config, is_enabled: value })} />
          </div>

          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={config.display_name} onChange={(e) => setConfig({ ...config, display_name: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>API Key {config.api_key_encrypted ? '(configured — leave blank to keep)' : ''}</Label>
            <Input type="password" placeholder={config.api_key_encrypted ? '••••••••' : 'Enter ElevenLabs API key'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>API Base URL</Label>
            <Input value={config.base_url} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Text-to-Speech Model</Label>
            <Input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} placeholder="eleven_flash_v2_5" />
            <p className="text-xs text-muted-foreground">Use a low-latency model for WhatsApp voice replies.</p>
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Voice Provider
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
