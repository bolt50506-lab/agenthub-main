import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const OMNIVOICE_DEFAULT_URL = 'https://agenthub-omnivoice-production.up.railway.app';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/mp4','audio/m4a']);

async function requireManager(req: NextRequest, businessId: string) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Unauthorized', status: 401 as const };
  const supabase = createServiceClient();
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return { error: 'Unauthorized', status: 401 as const };
  const userId = userData.user.id;
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_super_admin').eq('id', userId).maybeSingle(),
    supabase.from('business_members').select('role, status').eq('business_id', businessId).eq('user_id', userId).maybeSingle(),
  ]);
  if (profile?.is_super_admin !== true && !(membership?.status === 'active' && ['owner', 'admin'].includes(membership.role))) return { error: 'Forbidden', status: 403 as const };
  return { supabase };
}

async function serviceRequest(baseUrl: string, path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    return await fetch(`${baseUrl}${path}`, { ...init, headers: { ...(init?.headers || {}), 'x-agenthub-secret': process.env.AGENTHUB_WEBHOOK_SECRET || '' }, signal: controller.signal });
  } finally { clearTimeout(timer); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const service = createServiceClient();
  const { data: voice } = await service.from('voice_profiles').select('id, business_id, provider, provider_voice_id, status, is_default').eq('id', params.id).maybeSingle();
  if (!voice) return NextResponse.json({ error: 'Voice profile not found' }, { status: 404 });
  const auth = await requireManager(req, voice.business_id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const contentType = req.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const referenceText = String(form.get('referenceText') || '').trim();
    if (!(file instanceof File)) return NextResponse.json({ error: 'Upload an audio sample' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio file must be between 1 byte and 25 MB' }, { status: 400 });
    if (file.type && !ALLOWED_AUDIO_TYPES.has(file.type)) return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 });
    if (voice.provider !== 'omnivoice') return NextResponse.json({ error: 'Only OmniVoice samples can be replaced here' }, { status: 400 });
    const baseUrl = (process.env.OMNIVOICE_SERVICE_URL || OMNIVOICE_DEFAULT_URL).replace(/\/$/, '');
    const sampleForm = new FormData();
    sampleForm.append('file', file, file.name || 'voice-reference.mp3');
    if (referenceText) sampleForm.append('reference_text', referenceText);
    const providerResponse = await serviceRequest(baseUrl, `/profiles/${encodeURIComponent(voice.provider_voice_id)}/samples`, { method: 'POST', body: sampleForm }).catch(() => null);
    if (!providerResponse) return NextResponse.json({ error: 'OmniVoice service is unreachable' }, { status: 503 });
    const providerText = await providerResponse.text();
    if (!providerResponse.ok) return NextResponse.json({ error: providerText.slice(0, 1000) || 'OmniVoice rejected the replacement sample' }, { status: 502 });
    const { data: updated, error } = await auth.supabase.from('voice_profiles').update({ status: 'active' }).eq('id', voice.id).select('id, business_id, name, description, provider, provider_voice_id, clone_type, status, requires_verification, is_default, preview_url, language, created_at, updated_at').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, replaced: true, voice: updated });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.isDefault === true && voice.status !== 'active') return NextResponse.json({ error: 'Only active voices can be set as default' }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (typeof body?.name === 'string') { const name = body.name.trim(); if (!name) return NextResponse.json({ error: 'Voice name cannot be empty' }, { status: 400 }); updates.name = name.slice(0, 120); }
  if (typeof body?.description === 'string') updates.description = body.description.trim().slice(0, 500);
  if (typeof body?.language === 'string') updates.language = body.language.trim().slice(0, 40) || null;
  if (body?.isDefault === true) updates.is_default = true;
  if (body?.isDefault === true) await auth.supabase.from('voice_profiles').update({ is_default: false }).eq('business_id', voice.business_id).eq('is_default', true);
  if (Object.keys(updates).length === 0) return NextResponse.json({ success: true });
  const { data, error } = await auth.supabase.from('voice_profiles').update(updates).eq('id', params.id).select('id, business_id, name, description, provider, provider_voice_id, clone_type, status, requires_verification, is_default, preview_url, language, created_at, updated_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, voice: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const service = createServiceClient();
  const { data: voice } = await service.from('voice_profiles').select('id, business_id, provider, provider_voice_id').eq('id', params.id).maybeSingle();
  if (!voice) return NextResponse.json({ error: 'Voice profile not found' }, { status: 404 });
  const auth = await requireManager(req, voice.business_id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (voice.provider === 'omnivoice') {
    const baseUrl = (process.env.OMNIVOICE_SERVICE_URL || OMNIVOICE_DEFAULT_URL).replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/profiles/${encodeURIComponent(voice.provider_voice_id)}`, { method: 'DELETE', headers: { 'x-agenthub-secret': process.env.AGENTHUB_WEBHOOK_SECRET || '' } }).catch(() => null);
    if (response && !response.ok && response.status !== 404) return NextResponse.json({ error: 'OmniVoice profile deletion failed', details: (await response.text()).slice(0, 500) }, { status: 502 });
  }
  if (voice.provider === 'voicebox') {
    const { data: config } = await auth.supabase.from('voice_provider_configs').select('base_url').eq('provider', 'voicebox').maybeSingle();
    const baseUrl = (config?.base_url || '').replace(/\/$/, '');
    if (baseUrl) {
      const providerResponse = await fetch(`${baseUrl}/profiles/${encodeURIComponent(voice.provider_voice_id)}`, { method: 'DELETE' }).catch(() => null);
      if (providerResponse && !providerResponse.ok && providerResponse.status !== 404) return NextResponse.json({ error: 'Voicebox profile deletion failed', details: (await providerResponse.text()).slice(0, 500) }, { status: 502 });
    }
  }
  if (voice.provider === 'elevenlabs') {
    const { data: config } = await auth.supabase.from('voice_provider_configs').select('api_key_encrypted, base_url').eq('provider', 'elevenlabs').maybeSingle();
    if (config?.api_key_encrypted) {
      const baseUrl = (config.base_url || 'https://api.elevenlabs.io').replace(/\/$/, '');
      const providerResponse = await fetch(`${baseUrl}/v1/voices/${encodeURIComponent(voice.provider_voice_id)}`, { method: 'DELETE', headers: { 'xi-api-key': config.api_key_encrypted } });
      if (!providerResponse.ok && providerResponse.status !== 404) return NextResponse.json({ error: 'Voice provider deletion failed', details: (await providerResponse.text()).slice(0, 500) }, { status: 502 });
    }
  }
  const { error } = await auth.supabase.from('voice_profiles').delete().eq('id', voice.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
