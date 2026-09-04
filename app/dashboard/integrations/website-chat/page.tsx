'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Copy, Globe, Loader2, Save, ShieldCheck, ExternalLink } from 'lucide-react';

function normalizeDomain(value: string) {
  let v = value.trim();
  if (!v) return '';
  try { v = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname; } catch { v = v.replace(/^https?:\/\//i, '').split('/')[0]; }
  return v.toLowerCase().replace(/^www\./, '');
}

export default function WebsiteChatIntegrationPage() {
  const { activeBusiness } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [allowedDomains, setAllowedDomains] = useState('');
  const [title, setTitle] = useState('AI Assistant');
  const [welcome, setWelcome] = useState('Hi! How can I help you today?');
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    const { data, error } = await supabase.from('integrations').select('*').eq('business_id', activeBusiness.id).eq('type', 'website_chat').maybeSingle();
    if (error) toast({ title: 'Could not load Website Chat', description: error.message, variant: 'destructive' });
    const config = (data?.config || {}) as Record<string, unknown>;
    setSiteUrl(String(config.site_url || ''));
    const domains = Array.isArray(config.allowed_domains) ? config.allowed_domains.map(String) : [];
    setAllowedDomains(domains.join(', '));
    setTitle(String(config.widget_title || 'AI Assistant'));
    setWelcome(String(config.welcome_message || 'Hi! How can I help you today?'));
    setConnected(data?.status === 'connected');
    setLoading(false);
  }, [activeBusiness, toast]);

  useEffect(() => { load(); }, [load]);

  const businessId = activeBusiness?.id || '';
  const embedCode = useMemo(() => `<script src="https://agenthubai.vercel.app/widget.js?business=${businessId}"></script>`, [businessId]);
  const domains = useMemo(() => {
    const primary = normalizeDomain(siteUrl);
    const extra = allowedDomains.split(',').map(normalizeDomain).filter(Boolean);
    return Array.from(new Set([primary, ...extra].filter(Boolean)));
  }, [siteUrl, allowedDomains]);

  const save = async () => {
    if (!activeBusiness) return;
    const primary = normalizeDomain(siteUrl);
    if (!primary) {
      toast({ title: 'Website URL required', description: 'Enter the domain where you will install the widget.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const config = { site_url: primary, allowed_domains: domains, widget_title: title.trim() || 'AI Assistant', welcome_message: welcome.trim() || 'Hi! How can I help you today?' };
    const existing = await supabase.from('integrations').select('id').eq('business_id', activeBusiness.id).eq('type', 'website_chat').maybeSingle();
    const result = existing.data?.id
      ? await supabase.from('integrations').update({ name: 'Website Chat', status: 'connected', config }).eq('id', existing.data.id).select().maybeSingle()
      : await supabase.from('integrations').insert({ business_id: activeBusiness.id, type: 'website_chat', name: 'Website Chat', status: 'connected', config }).select().maybeSingle();
    setSaving(false);
    if (result.error) {
      toast({ title: 'Save failed', description: result.error.message, variant: 'destructive' });
      return;
    }
    setSiteUrl(primary);
    setAllowedDomains(domains.join(', '));
    setConnected(true);
    toast({ title: 'Website Chat connected', description: 'Your widget deployment settings are saved.' });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(embedCode);
    toast({ title: 'Embed code copied', description: 'Paste it before the closing </body> tag on your website.' });
  };

  if (!activeBusiness || loading) return <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Globe className="h-6 w-6 text-blue-600" /><h1 className="text-2xl font-bold">Website Chat</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Connect your client website and deploy its business-specific AgentHub AI widget.</p>
        </div>
        <Badge variant={connected ? 'default' : 'secondary'} className="gap-1">{connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{connected ? 'Connected' : 'Not configured'}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Website connection</CardTitle><CardDescription>Only these domains are authorized to use this business widget.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Website URL</Label><Input value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://example.com" /></div>
          <div className="space-y-2"><Label>Additional allowed domains</Label><Input value={allowedDomains} onChange={e => setAllowedDomains(e.target.value)} placeholder="shop.example.com, www.example.com" /><p className="text-xs text-muted-foreground">Comma-separated. The primary domain is included automatically.</p></div>
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm"><ShieldCheck className="h-4 w-4 text-green-600" />Domain validation protects the widget from unauthorized websites.</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Widget appearance</CardTitle><CardDescription>These values are loaded by the widget from your saved integration.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Widget title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="AI Assistant" /></div>
          <div className="space-y-2"><Label>Welcome message</Label><Input value={welcome} onChange={e => setWelcome(e.target.value)} placeholder="Hi! How can I help you today?" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Deploy on your website</CardTitle><CardDescription>Copy this exact code into your website. The business ID is automatically tied to this client account.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 font-mono text-xs break-all">{embedCode}</div>
          <div className="flex flex-wrap gap-2"><Button onClick={copy} variant="outline"><Copy className="mr-2 h-4 w-4" />Copy Embed Code</Button><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save & Connect</Button></div>
          <div className="rounded-lg border p-4 text-sm"><strong>Installation:</strong> paste the script once before <code>&lt;/body&gt;</code>. Do not use the old Bolt-hosted widget script. Keep this dashboard closed after installation; customer messages and AI replies are handled by AgentHub in the backend.</div>
          <Button variant="link" className="px-0" onClick={() => window.open('https://agenthubai.vercel.app/widget.js?business=' + encodeURIComponent(businessId), '_blank')}><ExternalLink className="mr-2 h-4 w-4" />Open deployed widget script</Button>
        </CardContent>
      </Card>
    </div>
  );
}
