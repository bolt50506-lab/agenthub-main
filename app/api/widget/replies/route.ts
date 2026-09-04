import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business_id');
  const sessionId = req.nextUrl.searchParams.get('session_id');
  const visitorId = req.nextUrl.searchParams.get('visitor_id');
  const after = req.nextUrl.searchParams.get('after');

  if (!businessId || !sessionId || !visitorId) {
    return NextResponse.json({ error: 'Missing session details' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, business_id, customer_id, status')
    .eq('id', sessionId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!conversation || conversation.status !== 'active' || conversation.customer_id !== visitorId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: CORS });
  }

  let query = supabase
    .from('messages')
    .select('id, content, created_at, sender_type, content_type')
    .eq('conversation_id', sessionId)
    .eq('business_id', businessId)
    .in('sender_type', ['agent', 'business'])
    .order('created_at', { ascending: true })
    .limit(100);

  if (after) {
    const parsed = new Date(after);
    if (!Number.isNaN(parsed.getTime())) {
      query = query.gt('created_at', parsed.toISOString());
    }
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error('[Widget] Failed to load replies:', error.message);
    return NextResponse.json({ error: 'Failed to load replies' }, { status: 500, headers: CORS });
  }

  return NextResponse.json({
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      content: message.content,
      created_at: message.created_at,
      sender: 'agent',
      content_type: message.content_type,
    })),
  }, { headers: CORS });
}
