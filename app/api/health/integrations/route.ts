import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const { data: user } = await supabase.auth.getUser(token);
  if (!user.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const businessId = new URL(req.url).searchParams.get('business_id') || '';
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  const { data: member } = await supabase.from('business_members').select('id').eq('business_id', businessId).eq('user_id', user.user.id).eq('status','active').maybeSingle();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const base = process.env.WHATSAPP_AGENT_URL || process.env.WHATSAPP_QR_SERVICE_URL || 'https://agenthub-whatsapp-service-production.up.railway.app';
  let railway: unknown = { ok: false, error: 'Not checked' };
  try {
    const response = await fetch(base.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    railway = await response.json().catch(() => ({ ok: response.ok, status: response.status }));
  } catch (e) {
    railway = { ok: false, error: e instanceof Error ? e.message : 'Health check failed' };
  }
  const { data: integrations } = await supabase.from('integrations').select('type,name,status,updated_at').eq('business_id', businessId);
  return NextResponse.json({ ok: true, railway, integrations: integrations || [], checked_at: new Date().toISOString() });
}
