'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mic2, Plus, Play, Star, Trash2, Upload, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type VoiceProfile = {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  clone_type: string;
  status: string;
  requires_verification: boolean;
  is_default: boolean;
  preview_url: string | null;
  language: string | null;
  created_at: string;
};

type Limit = { current: number; max: number; allowed: boolean };

export default function VoiceStudioPage() {
  const { activeBusiness, activeMembership } = useAuth();
  const { toast } = useToast();

  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [limit, setLimit] = useState<Limit>({ current: 0, max: 0, allowed: false });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [removeNoise, setRemoveNoise] = useState(false);

  const canManage = activeMembership?.role === 'owner' || activeMembership?.role === 'admin';

  const load = async () => {
    if (!activeBusiness) return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`/api/voice/profiles?businessId=${encodeURIComponent(activeBusiness.id)}`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ title: 'Unable to load Voice Studio', description: result.error || 'Please try again', variant: 'destructive' });
      setLoading(false);
      return;
    }

    setVoices(result.voices || []);
    setLimit(result.limit || { current: 0, max: 0, allowed: false });
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id]);

  const remaining = useMemo(() => Math.max(0, (limit.max || 0) - (limit.current || 0)), [limit]);

  const createVoice = async () => {
    if (!activeBusiness) return;
    if (!name.trim()) {
      toast({ title: 'Voice name is required', variant: 'destructive' });
      return;
    }
    if (!files.length) {
      toast({ title: 'Upload at least one voice sample', variant: 'destructive' });
      return;
    }
    if (!consent) {
      toast({ title: 'Voice ownership confirmation is required', variant: 'destructive' });
      return;
    }

    setCreating(true);
    const form = new FormData();
    form.set('businessId', activeBusiness.id);
    form.set('name', name.trim());
    form.set('description', description.trim());
    form.set('language', language.trim());
    form.set('referenceText', referenceText.trim());
    form.set('consent', 'true');
    form.set('removeBackgroundNoise', String(removeNoise));
    files.forEach((file) => form.append('files', file, file.name));

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/voice/profiles', {
      method: 'POST',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: form,
    });

    const result = await response.json().catch(() => ({}));
    setCreating(false);

    if (!response.ok) {
      toast({ title: 'Voice clone failed', description: result.error || 'Please check the sample and try again', variant: 'destructive' });
      return;
    }

    toast({ title: 'Voice clone created', description: 'Your cloned voice is ready to use.' });
    setName('');
    setDescription('');
    setLanguage('');
    setReferenceText('');
    setFiles([]);
    setConsent(false);
    setRemoveNoise(false);
    await load();
  };

  const makeDefault = async (voice: VoiceProfile) => {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/voice/profiles/${voice.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ isDefault: true }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ title: 'Unable to set default voice', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Default voice updated' });
    await load();
  };

  const deleteVoice = async (voice: VoiceProfile) => {
    if (!confirm(`Delete "${voice.name}"? This removes the clone from AgentHub and the voice provider.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/voice/profiles/${voice.id}`, {
      method: 'DELETE',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ title: 'Unable to delete voice', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Voice deleted' });
    await load();
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading Voice Studio...</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Mic2 className="w-6 h-6" /> Voice Studio</h2>
          <p className="text-muted-foreground">Create business voice clones and choose the voice your AI uses for voice replies.</p>
        </div>
        <Badge variant="secondary" className="w-fit text-sm px-3 py-1.5">
          Voice clones: {limit.current} / {limit.max}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create a cloned voice</CardTitle>
          <CardDescription>
            Upload clean speech samples. For best results, use roughly 1–2 minutes of clear speech with minimal background noise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!canManage && (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">Only business owners and admins can create or manage voice clones.</p>
          )}

          {limit.max === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Voice cloning is not included in this subscription plan.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Voice name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ali - Sales Voice" disabled={!canManage || remaining === 0 || creating} />
                </div>
                <div className="space-y-2">
                  <Label>Primary language (optional)</Label>
                  <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English, Urdu, Roman Urdu..." disabled={!canManage || remaining === 0 || creating} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Warm, professional voice for sales and customer support" disabled={!canManage || remaining === 0 || creating} />
              </div>

              <div className="space-y-2">
                <Label>Exact words spoken in the sample</Label>
                <Textarea
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  placeholder="Paste or type exactly what is spoken in the uploaded recording. This improves Voicebox cloning quality."
                  disabled={!canManage || remaining === 0 || creating}
                />
                <p className="text-xs text-muted-foreground">Recommended for Voicebox: enter the exact transcript of the reference recording.</p>
              </div>

              <div className="space-y-2">
                <Label>Voice samples</Label>
                <Input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mp4,audio/m4a"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  disabled={!canManage || remaining === 0 || creating}
                />
                {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} sample file(s) selected</p>}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4 gap-4">
                <div>
                  <p className="font-medium">Remove background noise</p>
                  <p className="text-xs text-muted-foreground">Use this only when the recording contains noticeable background noise.</p>
                </div>
                <Switch checked={removeNoise} onCheckedChange={setRemoveNoise} disabled={!canManage || remaining === 0 || creating} />
              </div>

              <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!canManage || remaining === 0 || creating} className="mt-1" />
                <span className="text-sm">
                  I confirm that this is my own voice or I have explicit permission from the voice owner to create and use this voice clone for this business.
                </span>
              </label>

              <Button onClick={createVoice} disabled={!canManage || remaining === 0 || creating} className="gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {creating ? 'Creating clone...' : `Create Voice Clone (${remaining} slot${remaining === 1 ? '' : 's'} left)`}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {voices.map((voice) => (
          <Card key={voice.id} className={voice.is_default ? 'border-primary' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Volume2 className="w-4 h-4" /> {voice.name}
                  </CardTitle>
                  <CardDescription>{voice.description || 'Cloned business voice'}</CardDescription>
                </div>
                {voice.is_default && <Badge>Default</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{voice.clone_type}</Badge>
                <Badge variant="outline">{voice.status}</Badge>
                {voice.language && <Badge variant="outline">{voice.language}</Badge>}
              </div>

              <div className="flex flex-wrap gap-2">
                {voice.preview_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={voice.preview_url} target="_blank" rel="noreferrer"><Play className="w-3.5 h-3.5 mr-1.5" /> Preview</a>
                  </Button>
                )}
                {!voice.is_default && voice.status === 'active' && (
                  <Button size="sm" variant="outline" onClick={() => makeDefault(voice)} disabled={!canManage}>
                    <Star className="w-3.5 h-3.5 mr-1.5" /> Set default
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteVoice(voice)} disabled={!canManage}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {voices.length === 0 && (
          <Card className="md:col-span-2">
            <CardContent className="py-10 text-center text-muted-foreground">
              <Mic2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
              No cloned voices yet. Create your first business voice above.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
