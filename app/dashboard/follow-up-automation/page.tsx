'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Zap } from 'lucide-react';

const DEFAULTS = {
  enabled: false,
  first_delay_hours: 24,
  second_delay_hours: 72,
  third_delay_hours: 168,
  max_followups: 3,
  stop_on_customer_reply: true,
  stop_on_won: true,
  channels: ['whatsapp'] as string[],
};

export default function FollowUpAutomationPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeBusiness) return;
    supabase.from('followup_automation_settings').select('*').eq('business_id', activeBusiness.id).maybeSingle()
      .then(({ data }) => {
        if (data) setSettings({
          enabled: data.enabled,
          first_delay_hours: data.first_delay_hours,
          second_delay_hours: data.second_delay_hours,
          third_delay_hours: data.third_delay_hours,
          max_followups: data.max_followups,
          stop_on_customer_reply: data.stop_on_customer_reply,
          stop_on_won: data.stop_on_won,
          channels: data.channels || ['whatsapp'],
        });
        setLoading(false);
      });
  }, [activeBusiness]);

  const save = async () => {
    if (!activeBusiness) return;
    setSaving(true);
    const { error } = await supabase.from('followup_automation_settings').upsert({
      business_id: activeBusiness.id,
      ...settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' });
    setSaving(false);
    if (error) toast({ title: 'Unable to save automation', description: error.message, variant: 'destructive' });
    else toast({ title: 'Follow-up automation saved' });
  };

  const setChannel = (channel: string, checked: boolean) => {
    setSettings((current) => ({
      ...current,
      channels: checked ? [...new Set([...current.channels, channel])] : current.channels.filter((item) => item !== channel),
    }));
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading automation...</div>;

  return <div className="max-w-3xl space-y-6">
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6 text-primary" /> Follow-up Automation</h1>
      <p className="text-muted-foreground mt-1">Automatically schedule and process follow-ups for your leads.</p>
    </div>

    <Card>
      <CardHeader><CardTitle>Automation</CardTitle><CardDescription>Turn automatic lead follow-ups on or off.</CardDescription></CardHeader>
      <CardContent className="flex items-center justify-between">
        <div><p className="font-medium">Enable automatic follow-ups</p><p className="text-sm text-muted-foreground">New qualifying leads can enter your follow-up sequence.</p></div>
        <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })} />
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Follow-up schedule</CardTitle><CardDescription>Hours after lead capture or the previous sequence step.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-3">
        {[['first_delay_hours','Follow-up 1'],['second_delay_hours','Follow-up 2'],['third_delay_hours','Follow-up 3']].map(([key,label]) => (
          <div key={key} className="space-y-2"><Label>{label}</Label><Input type="number" min="1" value={settings[key as keyof typeof settings] as number} onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })} /><p className="text-xs text-muted-foreground">Hours</p></div>
        ))}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Stop rules</CardTitle><CardDescription>Prevent unnecessary messages once the customer engages or converts.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-3"><Switch checked={settings.stop_on_customer_reply} onCheckedChange={(checked) => setSettings({ ...settings, stop_on_customer_reply: checked })} /><span>Stop future follow-ups when the customer replies</span></label>
        <label className="flex items-center gap-3"><Switch checked={settings.stop_on_won} onCheckedChange={(checked) => setSettings({ ...settings, stop_on_won: checked })} /><span>Stop future follow-ups when the lead is marked Won</span></label>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Channels</CardTitle><CardDescription>Select channels that are connected and support automated delivery.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-6">
        {['whatsapp','website_chat','instagram','facebook_messenger'].map((channel) => <label key={channel} className="flex items-center gap-2 capitalize"><Checkbox checked={settings.channels.includes(channel)} onCheckedChange={(checked) => setChannel(channel, checked === true)} />{channel.replace('_',' ')}</label>)}
      </CardContent>
    </Card>

    <Button onClick={save} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save automation</Button>
  </div>;
}
