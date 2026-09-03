import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    configId: string;
    apiKey?: string;
    baseUrl?: string;
    model: string;
    displayName: string;
  };

  const { configId, apiKey, baseUrl, model, displayName } = body;

  if (!configId) {
    return NextResponse.json({ error: 'Missing configId' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('ai_provider_configs')
    .select('id, provider')
    .eq('id', configId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Provider config not found' }, { status: 404, headers: CORS });
  }

  const update: Record<string, unknown> = {
    model,
    display_name: displayName,
    base_url: baseUrl || null,
  };

  if (apiKey && apiKey.trim()) {
    update.api_key_encrypted = apiKey.trim();
  }

  const { error } = await supabase
    .from('ai_provider_configs')
    .update(update)
    .eq('id', configId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ success: true }, { headers: CORS });
}
