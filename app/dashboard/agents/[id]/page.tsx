'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AGENT_CAPABILITIES } from '@/lib/types/database';
import type { Agent, AgentSettings } from '@/lib/types/database';

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeBusiness } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: agentData } = await supabase.from('agents').select('*').eq('id', id).maybeSingle();
      setAgent(agentData as Agent | null);
      if (agentData) {
        const { data: settingsData } = await supabase
          .from('agent_settings')
          .select('*')
          .eq('agent_id', id)
          .maybeSingle();
        setSettings(settingsData as AgentSettings | null);
      }
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    if (!agent || !activeBusiness) return;
    setSaving(true);

    await supabase.from('agents').update({
      name: agent.name,
      purpose: agent.purpose,
      description: agent.description,
      communication_style: agent.communication_style,
      primary_goal: agent.primary_goal,
      supported_languages: agent.supported_languages,
      status: agent.status,
      ai_provider: agent.ai_provider,
      enabled_capabilities: agent.enabled_capabilities,
    }).eq('id', agent.id);

    if (settings) {
      await supabase.from('agent_settings').update({
        tone: settings.tone,
        greeting_behavior: settings.greeting_behavior,
        auto_create_leads: settings.auto_create_leads,
        appointments_enabled: settings.appointments_enabled,
        auto_followups_enabled: settings.auto_followups_enabled,
        max_response_length: settings.max_response_length,
        response_language: settings.response_language,
        custom_instructions: settings.custom_instructions,
      }).eq('agent_id', agent.id);
    } else {
      await supabase.from('agent_settings').insert({
        agent_id: agent.id,
        business_id: activeBusiness.id,
        tone: 'professional',
      });
    }

    await supabase.from('activity_logs').insert({
      business_id: activeBusiness.id,
      action: 'updated_agent',
      entity_type: 'agent',
      entity_id: agent.id,
    });

    setSaving(false);
    toast({ title: 'Agent saved', description: 'Changes have been applied.' });
  };

  const toggleCapability = (cap: string) => {
    if (!agent) return;
    const caps = agent.enabled_capabilities.includes(cap)
      ? agent.enabled_capabilities.filter((c) => c !== cap)
      : [...agent.enabled_capabilities, cap];
    setAgent({ ...agent, enabled_capabilities: caps });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading agent...</div>;
  if (!agent) return <div className="text-muted-foreground">Agent not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/agents" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Agents
        </Link>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Agent Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input value={agent.name} onChange={(e) => setAgent({ ...agent, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={agent.status} onValueChange={(v) => setAgent({ ...agent, status: v as Agent['status'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Input value={agent.purpose} onChange={(e) => setAgent({ ...agent, purpose: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Primary Goal</Label>
              <Input value={agent.primary_goal ?? ''} onChange={(e) => setAgent({ ...agent, primary_goal: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={agent.description ?? ''} onChange={(e) => setAgent({ ...agent, description: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Communication Style</Label>
              <Input value={agent.communication_style ?? ''} onChange={(e) => setAgent({ ...agent, communication_style: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={agent.ai_provider ?? 'gemini'} onValueChange={(v) => setAgent({ ...agent, ai_provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Supported Languages (comma-separated)</Label>
            <Input
              value={agent.supported_languages.join(', ')}
              onChange={(e) => setAgent({ ...agent, supported_languages: e.target.value.split(',').map((l) => l.trim()).filter(Boolean) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Enabled Capabilities</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {AGENT_CAPABILITIES.map((cap) => (
              <div key={cap.value} className="flex items-center space-x-2">
                <Checkbox
                  id={cap.value}
                  checked={agent.enabled_capabilities.includes(cap.value)}
                  onCheckedChange={() => toggleCapability(cap.value)}
                />
                <Label htmlFor={cap.value} className="text-sm font-normal cursor-pointer">{cap.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Communication Behavior</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select
                value={settings?.tone ?? 'professional'}
                onValueChange={(v) => setSettings({ ...(settings ?? { id: '', agent_id: agent.id, business_id: activeBusiness?.id ?? '', tone: 'professional', greeting_behavior: '', auto_create_leads: true, appointments_enabled: true, auto_followups_enabled: false, max_response_length: 500, response_language: 'English', custom_instructions: '', created_at: '', updated_at: '' }), tone: v })}
              >
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
              <Label>Response Language</Label>
              <Input
                value={settings?.response_language ?? ''}
                onChange={(e) => setSettings({ ...(settings ?? {} as AgentSettings), response_language: e.target.value } as AgentSettings)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Greeting Message</Label>
            <Textarea
              value={settings?.greeting_behavior ?? ''}
              onChange={(e) => setSettings({ ...(settings ?? {} as AgentSettings), greeting_behavior: e.target.value } as AgentSettings)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Custom Instructions</Label>
            <Textarea
              value={settings?.custom_instructions ?? ''}
              onChange={(e) => setSettings({ ...(settings ?? {} as AgentSettings), custom_instructions: e.target.value } as AgentSettings)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Response Length</Label>
            <Input
              type="number"
              value={settings?.max_response_length ?? 500}
              onChange={(e) => setSettings({ ...(settings ?? {} as AgentSettings), max_response_length: Number(e.target.value) } as AgentSettings)}
            />
          </div>
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-create leads</p>
                <p className="text-xs text-muted-foreground">Create leads from conversations automatically</p>
              </div>
              <Switch
                checked={settings?.auto_create_leads ?? true}
                onCheckedChange={(v) => setSettings({ ...(settings ?? {} as AgentSettings), auto_create_leads: v } as AgentSettings)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Appointments enabled</p>
                <p className="text-xs text-muted-foreground">Allow the agent to book appointments</p>
              </div>
              <Switch
                checked={settings?.appointments_enabled ?? true}
                onCheckedChange={(v) => setSettings({ ...(settings ?? {} as AgentSettings), appointments_enabled: v } as AgentSettings)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Automatic follow-ups</p>
                <p className="text-xs text-muted-foreground">Create follow-up tasks automatically</p>
              </div>
              <Switch
                checked={settings?.auto_followups_enabled ?? false}
                onCheckedChange={(v) => setSettings({ ...(settings ?? {} as AgentSettings), auto_followups_enabled: v } as AgentSettings)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
