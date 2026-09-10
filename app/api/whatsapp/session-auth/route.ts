import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const expected = process.env.AGENTHUB_WEBHOOK_SECRET || '';
  if (!expected) return false;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}

function cleanSessionId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const sessionId = cleanSessionId(req.nextUrl.searchParams.get('session_id'));
  if (!sessionId) return NextResponse.json({ ok: false, error: 'Missing session_id' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('whatsapp_session_auth_state')
    .select('session_id, state, updated_at')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session_id: sessionId, state: data?.state ?? null, updated_at: data?.updated_at ?? null });
}

export async function PUT(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const sessionId = cleanSessionId(body?.session_id);
  if (!sessionId || !body?.state || typeof body.state !== 'object') {
    return NextResponse.json({ ok: false, error: 'session_id and state are required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('whatsapp_session_auth_state').upsert({
    session_id: sessionId,
    state: body.state,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id' });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session_id: sessionId });
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const sessionId = cleanSessionId(body?.session_id || req.nextUrl.searchParams.get('session_id'));
  if (!sessionId) return NextResponse.json({ ok: false, error: 'Missing session_id' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('whatsapp_session_auth_state').delete().eq('session_id', sessionId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, session_id: sessionId });
}
