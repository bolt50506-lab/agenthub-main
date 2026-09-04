import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business');

  if (!businessId) {
    return NextResponse.json({ error: 'Missing business parameter' }, { status: 400 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration unavailable' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('integrations')
    .select('status, config')
    .eq('business_id', businessId)
    .eq('type', 'website_chat')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to load widget configuration' }, { status: 500 });
  }

  if (!data || data.status === 'not_connected' || data.status === 'paused') {
    return NextResponse.json({ enabled: false });
  }

  const config = (data.config ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    enabled: true,
    title: typeof config.widget_title === 'string' && config.widget_title.trim() ? config.widget_title.trim() : 'AI Assistant',
    welcomeMessage: typeof config.welcome_message === 'string' && config.welcome_message.trim()
      ? config.welcome_message.trim()
      : 'Hi! 👋 How can I help you today?',
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
