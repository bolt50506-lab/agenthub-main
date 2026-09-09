'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Save, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_WELCOME = 'Hello! How can I help you today?';

export default function WelcomeMessagePage() {
  const { activeBusiness, activeMembership } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeBusiness) return;
    (async () => {
      const [{ data: business }, { data: agent }] = await Promise.all([
        supabase.from('businesses').select('welcome_message').eq('id', activeBusiness.id).maybeSingle(),
        supabase.from('agents').select('id').eq('business_id', activeBusiness.id).eq('status', 'active').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      ]);
      setMessage((business as any)?.welcome_message || '');
      setAgentId((agent as any)?.id || null);
      setLoading(false);
    })();
  }, [activeBusiness]);

  const save = async () => {
    if (!activeBusiness || !agentId) return;
    setSaving(true);

    const trimmed = message.trim();
    const { error: businessError } = await supabase
      .from('businesses')
      .update({ welcome_message: trimmed || null })
      .eq('id', activeBusiness.id);

    if (!businessError) {
      const { data: settings } = await supabase
        .from('agent_settings')
        .select('id, greeting_behavior')
        .eq('business_id', activeBusiness.id)
        .eq('agent_id', agentId)
        .maybeSingle();

      if (settings?.id) {
        const { error } = await supabase
          .from('agent_settings')
          .update({ greeting_behavior: trimmed || 'Natural' })
          .eq('id', settings.id);
        if (error) toast({ title: 'Could not save welcome message', description: error.message, variant: 'destructive' });
        else toast({ title: 'Welcome message saved', description: 'This business welcome message is now available to the WhatsApp AI agent.' });
      } else {
        toast({ title: 'Welcome message saved' });
      }
    } else {
      toast({ title: 'Could not save welcome message', description: businessError.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading welcome message...</div>;

  const canManage = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5" /> Welcome Message</CardTitle>
          <CardDescription>Set the custom first-contact greeting for this business. Leave it empty to let the AI use its normal greeting behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="welcome-message">Custom welcome message</Label>
            <Textarea
              id="welcome-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={DEFAULT_WELCOME}
              rows={6}
              maxLength={1000}
              disabled={!canManage || !agentId}
            />
            <p className="text-xs text-muted-foreground">Customers should receive this in the business's own wording. Language matching still applies to the ongoing conversation.</p>
          </div>
          {!agentId && <p className="text-sm text-destructive">No active AI agent is configured for this business.</p>}
          {canManage && <Button onClick={save} disabled={saving || !agentId}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}<Save className="w-4 h-4 mr-2" /> Save Welcome Message</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
