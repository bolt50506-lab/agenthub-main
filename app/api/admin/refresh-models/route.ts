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

function stripModelsPrefix(id: string): string {
  if (id.startsWith('models/')) return id.slice(7);
  return id;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { configId: string };
  const { configId } = body;

  if (!configId) {
    return NextResponse.json({ error: 'Missing configId' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data: config } = await supabase
    .from('ai_provider_configs')
    .select('provider, api_key_encrypted, base_url')
    .eq('id', configId)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ error: 'Provider config not found' }, { status: 404, headers: CORS });
  }

  try {
    if (config.provider === 'gemini') {
      const apiKey = config.api_key_encrypted;
      if (!apiKey) {
        return NextResponse.json({ error: 'No API key configured. Save an API key first.' }, { status: 400, headers: CORS });
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );

      if (!res.ok) {
        const errBody = await res.text();
        let msg = `${res.status}`;
        try { msg = JSON.parse(errBody).error?.message ?? msg; } catch { /* ignore */ }
        return NextResponse.json({ error: `Failed to list models: ${msg}` }, { status: 502, headers: CORS });
      }

      const data = await res.json();
      const models = (data.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string; displayName?: string }) => ({
          id: stripModelsPrefix(m.name),
          name: m.displayName ?? stripModelsPrefix(m.name),
        }));

      return NextResponse.json({ models }, { headers: CORS });

    } else if (config.provider === 'groq') {
      const apiKey = config.api_key_encrypted;
      if (!apiKey) {
        return NextResponse.json({ error: 'No API key configured. Save an API key first.' }, { status: 400, headers: CORS });
      }

      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const errBody = await res.text();
        let msg = `${res.status}`;
        try { msg = JSON.parse(errBody).error?.message ?? msg; } catch { /* ignore */ }
        return NextResponse.json({ error: `Failed to list models: ${msg}` }, { status: 502, headers: CORS });
      }

      const data = await res.json();
      const models = (data.data ?? [])
        .map((m: { id: string; owned_by?: string }) => ({
          id: m.id,
          name: m.id,
        }));

      return NextResponse.json({ models }, { headers: CORS });

    } else if (config.provider === 'ollama') {
      const baseUrl = config.base_url || 'http://localhost:11434';

      const res = await fetch(`${baseUrl}/api/tags`);

      if (!res.ok) {
        return NextResponse.json({ error: `Cannot reach Ollama server at ${baseUrl}: ${res.status}` }, { status: 502, headers: CORS });
      }

      const data = await res.json();
      const models = (data.models ?? [])
        .map((m: { name: string; model?: string }) => ({
          id: m.name ?? m.model ?? 'unknown',
          name: m.name ?? m.model ?? 'unknown',
        }));

      return NextResponse.json({ models }, { headers: CORS });

    } else {
      return NextResponse.json({ error: `Unknown provider: ${config.provider}` }, { status: 400, headers: CORS });
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Request failed: ${(err as Error).message}` },
      { status: 500, headers: CORS }
    );
  }
}
