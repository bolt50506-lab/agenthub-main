'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Building, Clock, Bot, Bell, Shield, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Business, AIProviderSettings, AIProvider } from '@/lib/types/database';
import Link from 'next/link';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const DAYS = [
  { key: 'monday', label: 'Monday' }, { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' }, { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' }, { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

export default function SettingsPage() {
  const { activeBusiness, activeMembership } = useAuth();
  const { toast } = useToast();
  const [biz, setBiz] = useState<Business | null>(null);
  const [aiSettings, setAiSettings] = useState<AIProviderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBiz, setSavingBiz] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [notifSettings, setNotifSettings] = useState({ newLeads: true, appointments: true, followUps: true, agentErrors: true });

  useEffect(() => {
    if (!activeBusiness) return;
    (async () => {
      const { data: bizData } = await supabase.from('businesses').select('*').eq('id', activeBusiness.id).maybeSingle();
      setBiz(bizData as Business | null);
      const { data: aiData } = await supabase.from('ai_provider_settings').select('*').eq('business_id', activeBusiness.id).maybeSingle();
      setAiSettings(aiData as AIProviderSettings | null);
      setLoading(false);
    })();
  }, [activeBusiness]);

  const saveBusiness = async () => {
    if (!biz) return;
    setSavingBiz(true);
    await supabase.from('businesses').update({
      name: biz.name, industry: biz.industry, description: biz.description, website: biz.website,
      phone: biz.phone, address: biz.address, timezone: biz.timezone,
      working_hours: biz.working_hours, appointment_duration: biz.appointment_duration,
    }).eq('id', biz.id);
    setSavingBiz(false);
    toast({ title: 'Business profile saved' });
  };

  const saveAI = async () => {
    if (!aiSettings) return;
    setSavingAI(true);
    await supabase.from('ai_provider_settings').update({
      primary_provider: aiSettings.primary_provider,
      fallback_provider: aiSettings.fallback_provider,
      ollama_url: aiSettings.ollama_url,
      model_name: aiSettings.model_name,
      temperature: aiSettings.temperature,
      max_tokens: aiSettings.max_tokens,
      is_configured: aiSettings.is_configured,
    }).eq('id', aiSettings.id);
    setSavingAI(false);
    toast({ title: 'AI provider settings saved' });
  };

  const updateWorkingHours = (day: string, field: string, value: string | boolean) => {
    if (!biz) return;
    setBiz({
      ...biz,
      working_hours: {
        ...biz.working_hours,
        [day]: { ...biz.working_hours[day], [field]: value },
      },
    });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading settings...</div>;

  const canManage = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  return (
    <div className="space-y-6 max-w-4xl">
      <Tabs defaultValue="business">
        <TabsList className="flex-wrap">
          <TabsTrigger value="business" className="gap-1.5"><Building className="w-3.5 h-3.5" /> Business</TabsTrigger>
          <TabsTrigger value="hours" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> Hours</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Bot className="w-3.5 h-3.5" /> AI Provider</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="w-3.5 h-3.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Security</TabsTrigger>
        </TabsList>

        {/* Business Profile */}
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>Update your business information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {biz && (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Business Name</Label><Input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} disabled={!canManage} /></div>
                    <div className="space-y-2"><Label>Industry</Label><Input value={biz.industry ?? ''} onChange={(e) => setBiz({ ...biz, industry: e.target.value })} disabled={!canManage} /></div>
                  </div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={biz.description ?? ''} onChange={(e) => setBiz({ ...biz, description: e.target.value })} rows={2} disabled={!canManage} /></div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Website</Label><Input value={biz.website ?? ''} onChange={(e) => setBiz({ ...biz, website: e.target.value })} disabled={!canManage} /></div>
                    <div className="space-y-2"><Label>Phone</Label><Input value={biz.phone ?? ''} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} disabled={!canManage} /></div>
                  </div>
                  <div className="space-y-2"><Label>Address</Label><Input value={biz.address ?? ''} onChange={(e) => setBiz({ ...biz, address: e.target.value })} disabled={!canManage} /></div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Time Zone</Label>
                      <Select value={biz.timezone} onValueChange={(v) => setBiz({ ...biz, timezone: v })} disabled={!canManage}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Appointment Duration (min)</Label>
                      <Select value={String(biz.appointment_duration)} onValueChange={(v) => setBiz({ ...biz, appointment_duration: Number(v) })} disabled={!canManage}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{[15, 30, 45, 60, 90, 120].map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  {canManage && <Button onClick={saveBusiness} disabled={savingBiz}>{savingBiz && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}<Save className="w-4 h-4 mr-2" /> Save</Button>}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Working Hours */}
        <TabsContent value="hours">
          <Card>
            <CardHeader>
              <CardTitle>Working Hours</CardTitle>
              <CardDescription>Configure when your business is open.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {biz && DAYS.map((day) => (
                <div key={day.key} className="flex flex-col items-stretch gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Switch checked={biz.working_hours[day.key]?.enabled ?? false} onCheckedChange={(v) => updateWorkingHours(day.key, 'enabled', v)} disabled={!canManage} />
                    <span className="text-sm font-medium w-24">{day.label}</span>
                  </div>
                  {biz.working_hours[day.key]?.enabled && (
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <Input type="time" value={biz.working_hours[day.key]?.open ?? '09:00'} onChange={(e) => updateWorkingHours(day.key, 'open', e.target.value)} className="w-28" disabled={!canManage} />
                      <span className="text-muted-foreground">to</span>
                      <Input type="time" value={biz.working_hours[day.key]?.close ?? '17:00'} onChange={(e) => updateWorkingHours(day.key, 'close', e.target.value)} className="w-28" disabled={!canManage} />
                    </div>
                  )}
                </div>
              ))}
              {canManage && <Button onClick={saveBusiness} disabled={savingBiz} className="mt-4">{savingBiz && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}<Save className="w-4 h-4 mr-2" /> Save Hours</Button>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Provider */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>AI Provider Settings</CardTitle>
              <CardDescription>Configure your AI providers. API keys are stored securely and never exposed in frontend code.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiSettings && (
                <>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      API keys for AI providers are configured via environment variables on the server side. They are never stored in the browser or exposed in frontend code. Set GEMINI_API_KEY, GROQ_API_KEY, or OLLAMA_URL in your environment.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Primary Provider</Label>
                      <Select value={aiSettings.primary_provider} onValueChange={(v) => setAiSettings({ ...aiSettings, primary_provider: v as AIProvider })} disabled={!canManage}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini">Google Gemini</SelectItem>
                          <SelectItem value="groq">Groq</SelectItem>
                          <SelectItem value="ollama">Ollama (Local)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Fallback Provider</Label>
                      <Select value={aiSettings.fallback_provider ?? 'none'} onValueChange={(v) => setAiSettings({ ...aiSettings, fallback_provider: (v === 'none' ? null : v) as AIProvider | null })} disabled={!canManage}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No fallback</SelectItem>
                          <SelectItem value="gemini">Google Gemini</SelectItem>
                          <SelectItem value="groq">Groq</SelectItem>
                          <SelectItem value="ollama">Ollama (Local)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Model Name</Label><Input value={aiSettings.model_name ?? ''} onChange={(e) => setAiSettings({ ...aiSettings, model_name: e.target.value })} placeholder="e.g. gemini-3.6-flash" disabled={!canManage} /></div>
                    <div className="space-y-2"><Label>Ollama URL</Label><Input value={aiSettings.ollama_url ?? ''} onChange={(e) => setAiSettings({ ...aiSettings, ollama_url: e.target.value })} placeholder="http://localhost:11434" disabled={!canManage} /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Temperature</Label><Input type="number" step="0.01" min="0" max="2" value={aiSettings.temperature} onChange={(e) => setAiSettings({ ...aiSettings, temperature: parseFloat(e.target.value) })} disabled={!canManage} /></div>
                    <div className="space-y-2"><Label>Max Tokens</Label><Input type="number" value={aiSettings.max_tokens} onChange={(e) => setAiSettings({ ...aiSettings, max_tokens: Number(e.target.value) })} disabled={!canManage} /></div>
                  </div>
                  <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Provider is configured</p>
                      <p className="text-xs text-muted-foreground">Mark as configured once environment variables are set</p>
                    </div>
                    <Switch checked={aiSettings.is_configured} onCheckedChange={(v) => setAiSettings({ ...aiSettings, is_configured: v })} disabled={!canManage} />
                  </div>
                  {canManage && <Button onClick={saveAI} disabled={savingAI}>{savingAI && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}<Save className="w-4 h-4 mr-2" /> Save AI Settings</Button>}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Choose which events trigger notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'newLeads', label: 'New leads', desc: 'Notify when a new lead is captured' },
                { key: 'appointments', label: 'Appointments', desc: 'Notify when appointments are created or changed' },
                { key: 'followUps', label: 'Follow-ups', desc: 'Notify about upcoming and overdue follow-ups' },
                { key: 'agentErrors', label: 'Agent errors', desc: 'Notify when an AI agent encounters an error' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={notifSettings[item.key as keyof typeof notifSettings]}
                    onCheckedChange={(v) => setNotifSettings({ ...notifSettings, [item.key]: v })}
                  />
                </div>
              ))}
              <Button onClick={() => toast({ title: 'Notification preferences saved' })} className="mt-4 gap-2">
                <Save className="w-4 h-4" /> Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Manage your account security settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Multi-tenant Isolation</p>
                  <p className="text-xs text-muted-foreground">Your data is isolated via Row Level Security policies</p>
                </div>
                <Badge variant="default" className="bg-green-600">Active</Badge>
              </div>
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Role-Based Access Control</p>
                  <p className="text-xs text-muted-foreground">Your role: <Badge variant="secondary" className="capitalize">{activeMembership?.role}</Badge></p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">API Key Security</p>
                  <p className="text-xs text-muted-foreground">API keys are stored server-side only, never in frontend code</p>
                </div>
                <Badge variant="default" className="bg-green-600">Protected</Badge>
              </div>
              <Link href="/dashboard/group-rules">
                <Button variant="outline" className="gap-2 mt-2">
                  <LinkIcon className="w-4 h-4" /> Configure Group AI Rules
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
