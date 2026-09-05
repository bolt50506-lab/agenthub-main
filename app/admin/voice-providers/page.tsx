'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Mic2, Save, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type VoiceProvider = {
  id: string;
  provider: 'elevenlabs' | 'voicebox' | string;
  display_name: string;
  api_key_encrypted: string | null;
  base_url: string;
  model: string;
  is_enabled: boolean;
};

export default function VoiceProvidersPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<VoiceProvider[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/admin/voice-provider-config', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast({ title: 'Unable to load voice providers', description: result.error || 'Please try again', variant: 'destructive' });
      setLoading(false);
      return;
    }

    setConfigs(result.providers || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateConfig = (id: string, patch: Partial<VoiceProvider>) => {
    setConfigs((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const testConnection = async (config: VoiceProvider) => {
    setTesting(config.id);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/admin/voice-provider-config/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ configId: config.id, baseUrl: config.base_url }),
    });
    const result = await response.json().catch(() => ({}));
    setTesting(null);
    toast({
      title: response.ok ? 'Connection successful' : 'Connection failed',
      description: result.message || result.error || 'Unable to test Voicebox',
      variant: response.ok ? 'default' : 'destructive',
    });
  };

  const save = async (config: VoiceProvider) => {
    setSaving(config.id);
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch('/api/admin/voice-provider-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        configId: config.id,
        apiKey: apiKeys[config.id] || '',
        baseUrl: config.base_url,
        model: config.model,
        displayName: config.display_name,
        isEnabled: config.is_enabled,
      }),
    });

    const result = await response.json().catch(() => ({}));
    setSaving(null);

    if (!response.ok) {
      toast({ title: 'Save failed', description: result.error || 'Unable to save provider', variant: 'destructive' });
      return;
    }

    setApiKeys((current) => ({ ...current, [config.id]: '' }));
    setConfigs((current) => current.map((item) => item.id === config.id ? {
      ...item,
      api_key_encrypted: config.provider === 'elevenlabs' ? (item.api_key_encrypted || 'configured') : item.api_key_encrypted,
    } : item));
    toast({ title: `${config.display_name} saved` });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading voice providers...</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Voice Providers</h2>
        <p className="text-muted-foreground">Configure free self-hosted Voicebox or ElevenLabs for cloned business voice replies.</p>
      </div>

      {configs.map((config) => {
        const isVoicebox = config.provider === 'voicebox';
        return (
          <Card key={config.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isVoicebox ? <Server className="w-5 h-5" /> : <Mic2 className="w-5 h-5" />}
                {config.display_name}
              </CardTitle>
              <CardDescription>
                {isVoicebox
                  ? 'Voicebox is self-hosted. AgentHub needs a reachable Voicebox server URL for production synthesis.'
                  : 'ElevenLabs is optional. API credentials remain server-side and are never shown to businesses.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Enable {config.display_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {isVoicebox
                      ? 'When enabled, new clones prefer Voicebox over ElevenLabs.'
                      : 'Used as a fallback provider when Voicebox is disabled.'}
                  </p>
                </div>
                <Switch checked={config.is_enabled} onCheckedChange={(value) => updateConfig(config.id, { is_enabled: value })} />
              </div>

              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input value={config.display_name} onChange={(e) => updateConfig(config.id, { display_name: e.target.value })} />
              </div>

              {!isVoicebox && (
                <div className="space-y-2">
                  <Label>API Key {config.api_key_encrypted ? '(configured — leave blank to keep)' : ''}</Label>
                  <Input
                    type="password"
                    placeholder={config.api_key_encrypted ? '••••••••' : 'Enter ElevenLabs API key'}
                    value={apiKeys[config.id] || ''}
                    onChange={(e) => setApiKeys((current) => ({ ...current, [config.id]: e.target.value }))}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>{isVoicebox ? 'Voicebox Server URL' : 'API Base URL'}</Label>
                <Input
                  value={config.base_url}
                  onChange={(e) => updateConfig(config.id, { base_url: e.target.value })}
                  placeholder={isVoicebox ? 'https://your-voicebox-server.example.com' : 'https://api.elevenlabs.io'}
                />
                {isVoicebox && (
                  <p className="text-xs text-muted-foreground">
                    Do not enter localhost for a production Vercel/Railway deployment. The URL must be reachable from AgentHub servers.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{isVoicebox ? 'Default Voicebox Engine' : 'Text-to-Speech Model'}</Label>
                <Input
                  value={config.model}
                  onChange={(e) => updateConfig(config.id, { model: e.target.value })}
                  placeholder={isVoicebox ? 'chatterbox' : 'eleven_flash_v2_5'}
                />
                <p className="text-xs text-muted-foreground">
                  {isVoicebox ? 'Examples: qwen, chatterbox, chatterbox_turbo, luxtts, tada.' : 'Use a low-latency model for WhatsApp voice replies.'}
                </p>
              </div>

{isVoicebox && (
                <Button variant="outline" onClick={() => testConnection(config)} disabled={testing === config.id}>
                  {testing === config.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
                  Test Connection
                </Button>
              )}

              <Button onClick={() => save(config)} disabled={saving === config.id}>
                {saving === config.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save {config.display_name}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {configs.length === 0 && <p className="text-muted-foreground">No voice provider configurations are available. Run the latest database migration.</p>}
    </div>
  );
}
