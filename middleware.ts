import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const config = {
  matcher: ['/api/whatsapp/incoming'],
};

export async function middleware(req: NextRequest) {
  if (req.method !== 'POST') return NextResponse.next();

  try {
    const body = await req.clone().json();
    const from = typeof body?.from === 'string' ? body.from.trim() : '';
    const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : '';

    // Group targeting is WhatsApp-specific. Private chats continue through the
    // normal AI pipeline and are never filtered by the group selector.
    if (!from.endsWith('@g.us') || !sessionId) return NextResponse.next();

    const supabase = createServiceClient();
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('business_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (!session?.business_id) return NextResponse.next();

    const { data: rule } = await supabase
      .from('group_rules')
      .select('group_target_mode, selected_group_ids')
      .eq('business_id', session.business_id)
      .maybeSingle();

    if (rule?.group_target_mode === 'selected') {
      const selectedIds = Array.isArray(rule.selected_group_ids) ? rule.selected_group_ids.map(String) : [];
      if (!selectedIds.includes(from)) {
        return NextResponse.json({
          success: true,
          reply: null,
          ignored: true,
          reason: 'WhatsApp group is not selected for this agent.',
        });
      }
    }

    return NextResponse.next();
  } catch (error) {
    // Never break WhatsApp because targeting metadata is temporarily unavailable.
    // The normal route still applies its existing group rules.
    console.error('[WhatsApp targeting middleware] Failed:', error instanceof Error ? error.message : error);
    return NextResponse.next();
  }
}
