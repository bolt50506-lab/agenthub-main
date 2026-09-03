'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, AlertCircle, Loader2, CheckCircle2, XCircle, Zap, Star, RefreshCw, Server, Cloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { AIProviderConfig, AIProvider } from '@/lib/types/database';

const PROVIDER_INFO: Record<AIProvider, { name: string; desc: string; defaultModel: string }> = {
  gemini: {
    name: 'Google Gemini',
    desc: 'Primary AI provider. Free-tier available. Uses Google Generative AI API.',
    defaultModel: 'gemini-3.6-flash',
  },
  groq: {
    name: 'Groq',
    desc: 'Fast inference using Groq LPU. Free-tier available. Great for low-latency responses.',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  ollama: {
    name: 'Ollama',
    desc: 'Self-hosted AI provider. Runs models on your own server via Ollama.',
    defaultModel: 'llama3.2',
  },
};

const RETIRED_GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.5-flash', 'gemini-2.5-pro'];

function normalizeModel(provider: AIProvider, model: string): string {
  if (provider === 'gemini') {
    if (RETIRED_GEMINI_MODELS.includes(model)) return PROVIDER_INFO.gemini.defaultModel;
    if (model.startsWith('models/')) return model.slice(7);
  }
  return model;
}

function getProviderStatus(config: AIProviderConfig): { label: string; color: string } {
  if (!config.is_enabled) return { label: 'Disabled', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  if (config.last_test_status === 'success') return { label: 'Connected', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  if (config.last_test_status === 'failure') return { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
  if (config.api_key_encrypted || config.provider === 'ollama') return { label: 'Configured', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
  return { label: 'Not Configured', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
}

interface DiscoveredModel {
  id: string;
  name: string;
}

export default function AdminAIProvidersPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<AIProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, DiscoveredModel[]>>({});
  const [editValues, setEditValues] = useState<Record<string, { api_key: string; base_url: string; model: string; display_name: string }>>({});

  const loadConfigs = useCallback(async () => {
    const { data, error } = await supabase
      .from('ai_provider_configs')
      .select('*')
      .order('priority', { ascending: true });
    if (error) {
      toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    }
    const loaded = (data ?? []) as AIProviderConfig[];
    setConfigs(loaded);
    const vals: Record<string, { api_key: string; base_url: string; model: string; display_name: string }> = {};
    for (const c of loaded) {
      vals[c.id] = {
        api_key: '',
        base_url: c.base_url ?? '',
        model: normalizeModel(c.provider, c.model),
        display_name: c.display_name,
      };
    }
    setEditValues(vals);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleSave = async (config: AIProviderConfig) => {
    setSaving(config.id);
    const vals = editValues[config.id];
    if (!vals) { setSaving(null); return; }

    try {
      const res = await fetch('/api/admin/ai-provider-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: config.id,
          apiKey: vals.api_key.trim() || undefined,
          baseUrl: vals.base_url.trim() || undefined,
          model: normalizeModel(config.provider, vals.model),
          displayName: vals.display_name,
        }),
      });
      const result = await res.json() as { success?: boolean; error?: string };
      if (result.error) {
        toast({ title: 'Failed to save', description: result.error, variant: 'destructive' });
      } else {
        toast({ title: 'Saved', description: `${PROVIDER_INFO[config.provider].name} configuration updated. Status: Configured. Run a test to verify.` });
        await loadConfigs();
      }
    } catch (err) {
      toast({ title: 'Failed to save', description: (err as Error).message, variant: 'destructive' });
    }
    setSaving(null);
  };

  const handleToggle = async (config: AIProviderConfig, enabled: boolean) => {
    const { error } = await supabase
      .from('ai_provider_configs')
      .update({ is_enabled: enabled })
      .eq('id', config.id);
    if (error) {
      toast({ title: 'Failed to toggle', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: enabled ? 'Provider enabled' : 'Provider disabled', description: PROVIDER_INFO[config.provider].name });
      await loadConfigs();
    }
  };

  const handleSetPrimary = async (config: AIProviderConfig) => {
    const { error } = await supabase.rpc('set_primary_ai_provider', { provider_id: config.id });
    if (error) {
      const { error: err2 } = await supabase
        .from('ai_provider_configs')
        .update({ is_primary: false })
        .neq('id', config.id);
      if (!err2) {
        await supabase
          .from('ai_provider_configs')
          .update({ is_primary: true })
          .eq('id', config.id);
      }
    }
    toast({ title: 'Primary provider set', description: PROVIDER_INFO[config.provider].name });
    await loadConfigs();
  };

  const handleTest = async (config: AIProviderConfig) => {
    setTesting(config.id);
    try {
      const vals = editValues[config.id];
      if (vals?.api_key?.trim() || vals?.base_url?.trim() || vals?.model?.trim()) {
        await handleSave(config);
      }

      const res = await fetch('/api/admin/test-ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: config.id }),
      });
      const result = await res.json() as { success: boolean; message: string };

      toast({
        title: result.success ? 'Test passed — Connected' : 'Test failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      await loadConfigs();
    } catch (err) {
      toast({ title: 'Test failed', description: (err as Error).message, variant: 'destructive' });
    }
    setTesting(null);
  };

  const handleRefreshModels = async (config: AIProviderConfig) => {
    setRefreshing(config.id);
    try {
      const vals = editValues[config.id];
      if (vals?.api_key?.trim()) {
        await handleSave(config);
      }

      const res = await fetch('/api/admin/refresh-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: config.id }),
      });
      const result = await res.json() as { models?: DiscoveredModel[]; error?: string };

      if (result.error) {
        toast({ title: 'Failed to refresh models', description: result.error, variant: 'destructive' });
      } else if (result.models && result.models.length > 0) {
        setDiscoveredModels((prev) => ({ ...prev, [config.id]: result.models! }));
        toast({ title: 'Models loaded', description: `Found ${result.models.length} available models.` });
      } else {
        toast({ title: 'No models found', description: 'The provider returned no available models.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Failed to refresh models', description: (err as Error).message, variant: 'destructive' });
    }
    setRefreshing(null);
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading AI providers...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">AI Providers</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure platform-level AI providers. API keys are stored securely and never exposed to business users.
        </p>
      </div>

      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription className="text-xs">
          API keys are stored server-side and never returned to the browser after saving. The primary provider is used for all AI requests. Disabled providers are skipped. Fallback providers are tried in priority order if the primary fails.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {configs.map((config) => {
          const info = PROVIDER_INFO[config.provider];
          const vals = editValues[config.id] ?? { api_key: '', base_url: '', model: config.model, display_name: config.display_name };
          const status = getProviderStatus(config);
          const models = discoveredModels[config.id];

          return (
            <Card key={config.id} className={config.is_enabled ? 'border-primary/30' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      {config.provider === 'ollama' ? <Server className="w-5 h-5 text-primary" /> : <Cloud className="w-5 h-5 text-primary" />}
                    </div>
                    <div>
                      <CardTitle className="text-base">{info.name}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-1">
                        {config.is_primary && <Badge className="text-xs gap-1"><Star className="w-3 h-3" /> Primary</Badge>}
                        <Badge variant="secondary" className={`text-xs ${status.color}`}>{status.label}</Badge>
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={config.is_enabled}
                    onCheckedChange={(checked) => handleToggle(config, checked)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{info.desc}</p>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      className="h-8 text-sm"
                      value={vals.display_name}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [config.id]: { ...vals, display_name: e.target.value } }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">API Key {config.api_key_encrypted ? '(stored — leave blank to keep)' : ''}</Label>
                    <Input
                      type="password"
                      className="h-8 text-sm"
                      placeholder={config.api_key_encrypted ? '••••••••' : 'Enter API key'}
                      value={vals.api_key}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [config.id]: { ...vals, api_key: e.target.value } }))}
                    />
                  </div>

                  {config.provider === 'ollama' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Server URL</Label>
                      <Input
                        className="h-8 text-sm"
                        placeholder="http://localhost:11434"
                        value={vals.base_url}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, [config.id]: { ...vals, base_url: e.target.value } }))}
                      />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Use a reachable server URL if AgentHub is hosted remotely. localhost only works when both run on the same machine.
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Model</Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => handleRefreshModels(config)}
                        disabled={refreshing === config.id}
                      >
                        {refreshing === config.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Refresh
                      </Button>
                    </div>
                    {models && models.length > 0 ? (
                      <Select
                        value={vals.model}
                        onValueChange={(v) => setEditValues((prev) => ({ ...prev, [config.id]: { ...vals, model: v } }))}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 text-sm"
                        value={vals.model}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, [config.id]: { ...vals, model: e.target.value } }))}
                        placeholder={info.defaultModel}
                      />
                    )}
                    <p className="text-xs text-muted-foreground">Click Refresh to discover available models from the provider.</p>
                  </div>
                </div>

                {config.last_tested_at && (
                  <div className="flex items-center gap-2 text-xs">
                    {config.last_test_status === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                    )}
                    <span className="text-muted-foreground">
                      Last tested: {new Date(config.last_tested_at).toLocaleDateString()}
                    </span>
                  </div>
                )}

                {config.last_test_status === 'failure' && config.last_test_message && (
                  <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-700 dark:text-red-400">{config.last_test_message}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleTest(config)} disabled={testing === config.id}>
                    {testing === config.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
                    Test
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleSave(config)} disabled={saving === config.id}>
                    {saving === config.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  {!config.is_primary && config.is_enabled && (
                    <Button size="sm" variant="ghost" onClick={() => handleSetPrimary(config)}>
                      <Star className="w-3.5 h-3.5 mr-1.5" /> Set Primary
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
