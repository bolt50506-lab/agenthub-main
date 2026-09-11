'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ImagePlus, Save, RefreshCw, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

const DEFAULTS = {
  heroBadge: 'AI customer operations for growing businesses',
  heroHeading: 'Stop losing customers in your inbox.',
  heroHighlight: 'Let AgentHub handle the work.',
  heroDescription: 'One AI business assistant that answers customers, understands your products and prices, captures leads, books appointments, follows up, and takes action across your channels.',
  primaryCta: 'Start automating',
  secondaryCta: 'See how it works',
  heroImage: '/landing-hero.svg?v=bright-agenthub-2',
  trialBadgeEnabled: true,
  trialBadgeText: 'Start 7-Day Free Demo',
  contactPhone: '+92 340 7465567',
  seoTitle: 'AgentHub AI | AI Business Automation & Customer Support',
  seoDescription: 'AI business automation for WhatsApp, Instagram, Facebook Messenger and website chat. Capture leads, answer customers, book appointments and automate follow-ups 24/7.',
};

type LandingContent = typeof DEFAULTS;

export default function WebsiteContentPage() {
  const { profile } = useAuth();
  const [content, setContent] = useState<LandingContent>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setStatus(null);
    const { data, error } = await supabase.from('site_content').select('value').eq('key', 'landing').maybeSingle();
    if (error) setStatus({ ok: false, text: error.message });
    if (data?.value) setContent({ ...DEFAULTS, ...(data.value as Partial<LandingContent>) });
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const update = <K extends keyof LandingContent>(key: K, value: LandingContent[K]) => {
    setContent((current) => ({ ...current, [key]: value }));
    setStatus(null);
  };

  const save = async () => {
    if (!profile?.is_super_admin) return;
    setSaving(true);
    setStatus(null);
    const { error } = await supabase.from('site_content').upsert({
      key: 'landing',
      value: content,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    }, { onConflict: 'key' });
    setSaving(false);
    setStatus(error ? { ok: false, text: error.message } : { ok: true, text: 'Website content saved. The public landing page will use it automatically.' });
  };

  const uploadHero = async (file: File) => {
    if (!profile?.is_super_admin) return;
    if (!file.type.startsWith('image/')) {
      setStatus({ ok: false, text: 'Please select an image file.' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setStatus({ ok: false, text: 'Please keep the image under 8 MB.' });
      return;
    }

    setUploading(true);
    setStatus(null);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `landing/hero-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('site-assets').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
    if (uploadError) {
      setUploading(false);
      setStatus({ ok: false, text: uploadError.message });
      return;
    }

    const { data } = supabase.storage.from('site-assets').getPublicUrl(path);
    update('heroImage', `${data.publicUrl}?v=${Date.now()}`);
    setUploading(false);
    setStatus({ ok: true, text: 'Image uploaded. Click Save Changes to publish it.' });
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Loading website content...</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Website Content Manager</h2>
          <p className="mt-1 text-sm text-muted-foreground">Change landing-page text and images without editing code or GitHub.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={saving || uploading}><RefreshCw className="mr-2 h-4 w-4" />Reload</Button>
          <a href="/" target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" />Preview site</Button></a>
          <Button onClick={() => void save()} disabled={saving || uploading}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>

      {status && <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${status.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>{status.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{status.text}</div>}

      <Card>
        <CardHeader><CardTitle>Hero section</CardTitle><CardDescription>This is the first section visitors see. Keep the heading concise and the description customer-focused.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label>Hero badge</Label><Input value={content.heroBadge} onChange={(e) => update('heroBadge', e.target.value)} /></div>
            <div className="space-y-2"><Label>Primary button</Label><Input value={content.primaryCta} onChange={(e) => update('primaryCta', e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Main heading</Label><Input value={content.heroHeading} onChange={(e) => update('heroHeading', e.target.value)} /></div>
          <div className="space-y-2"><Label>Highlighted heading</Label><Input value={content.heroHighlight} onChange={(e) => update('heroHighlight', e.target.value)} /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea rows={4} value={content.heroDescription} onChange={(e) => update('heroDescription', e.target.value)} /></div>
          <div className="space-y-2"><Label>Secondary button</Label><Input value={content.secondaryCta} onChange={(e) => update('secondaryCta', e.target.value)} /></div>

          <div className="rounded-2xl border border-dashed p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="h-28 w-full overflow-hidden rounded-xl border bg-muted sm:w-48"><img src={content.heroImage} alt="Current hero" className="h-full w-full object-cover" /></div>
              <div className="flex-1">
                <Label className="text-base">Hero image</Label>
                <p className="mt-1 text-xs text-muted-foreground">Upload JPG, PNG, WEBP, GIF or another browser-supported image up to 8 MB. The image is stored in Supabase Storage.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <ImagePlus className="mr-2 h-4 w-4" />{uploading ? 'Uploading...' : 'Replace image'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadHero(file); e.currentTarget.value = ''; }} />
                  </label>
                  <Input value={content.heroImage} onChange={(e) => update('heroImage', e.target.value)} className="min-w-[280px] flex-1" placeholder="Or paste an image URL" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Trial badge & contact</CardTitle><CardDescription>The trial badge stays on the left side of the landing page and can be turned off when needed.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border p-4"><div><Label>Show 7-day trial badge</Label><p className="text-xs text-muted-foreground">Hide or show the floating CTA without touching the page code.</p></div><Switch checked={content.trialBadgeEnabled} onCheckedChange={(value) => update('trialBadgeEnabled', value)} /></div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label>Trial badge text</Label><Input value={content.trialBadgeText} onChange={(e) => update('trialBadgeText', e.target.value)} /></div>
            <div className="space-y-2"><Label>WhatsApp / contact number</Label><Input value={content.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} placeholder="+92 340 7465567" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>SEO</CardTitle><CardDescription>These values are saved for the website content system and can be used for future dynamic metadata.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2"><Label>SEO title</Label><Input value={content.seoTitle} onChange={(e) => update('seoTitle', e.target.value)} /></div>
          <div className="space-y-2"><Label>SEO description</Label><Textarea rows={3} value={content.seoDescription} onChange={(e) => update('seoDescription', e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-8"><Button size="lg" onClick={() => void save()} disabled={saving || uploading}><Save className="mr-2 h-5 w-5" />{saving ? 'Saving...' : 'Save Changes'}</Button></div>
    </div>
  );
}
