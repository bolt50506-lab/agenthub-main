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
  const body = await req.json() as { configId: string };
  const { configId } = body;

  if (!configId) {
    return NextResponse.json({ error: 'Missing configId' }, { status: 400, headers: CORS });
  }

  const supabase = createServiceClient();

  const { data: config } = await supabase
    .from('ai_provider_configs')
    .select('provider, api_key_encrypted, base_url, model')
    .eq('id', configId)
    .maybeSingle();

  if (!config) {
    return NextResponse.json({ error: 'Provider config not found' }, { status: 404, headers: CORS });
  }

  let success = false;
  let message = '';

  try {
    if (config.provider === 'gemini') {
      const apiKey = config.api_key_encrypted;
      const model = stripModelsPrefix(config.model || 'gemini-3.6-flash');

      if (!apiKey) {
        return NextResponse.json({ success: false, message: 'No API key configured. Save an API key first.' }, { headers: CORS });
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "test"' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }
      );
      success = res.ok;
      if (res.ok) {
        message = `API key valid and model "${model}" is accessible.`;
      } else {
        const errBody = await res.text();
        let errMsg = `${res.status}`;
        try { errMsg = JSON.parse(errBody).error?.message ?? errMsg; } catch { errMsg = errBody.slice(0, 200); }
        message = `API error: ${errMsg}`;
      }
    } else if (config.provider === 'groq') {
      const apiKey = config.api_key_encrypted;
      const model = config.model || 'llama-3.3-70b-versatile';

      if (!apiKey) {
        return NextResponse.json({ success: false, message: 'No API key configured. Save an API key first.' }, { headers: CORS });
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say "test"' }],
          max_tokens: 5,
        }),
      });
      success = res.ok;
      if (res.ok) {
        message = `API key valid and model "${model}" is accessible.`;
      } else {
        const errBody = await res.text();
        let errMsg = `${res.status}`;
        try { errMsg = JSON.parse(errBody).error?.message ?? errMsg; } catch { errMsg = errBody.slice(0, 200); }
        message = `API error: ${errMsg}`;
      }
    } else if (config.provider === 'ollama') {
      const baseUrl = config.base_url || 'http://localhost:11434';
      const model = config.model || 'llama3.2';

      const tagsRes = await fetch(`${baseUrl}/api/tags`);

      if (!tagsRes.ok) {
        message = `Cannot reach Ollama server at ${baseUrl}. HTTP ${tagsRes.status}. If AgentHub is hosted remotely, configure a reachable Ollama server URL.`;
      } else {
        const tagsData = await tagsRes.json();
        const installedModels = (tagsData.models ?? []).map((m: { name?: string; model?: string }) => m.name ?? m.model ?? '');
        const modelBase = model.split(':')[0];
        const modelExists = installedModels.some((n: string) => n === model || n.startsWith(modelBase + ':'));

        if (!modelExists && installedModels.length > 0) {
          success = false;
          message = `Server reachable but model "${model}" is not installed. Available: ${installedModels.join(', ') || 'none'}`;
        } else {
          success = true;
          message = installedModels.length > 0
            ? `Ollama server reachable and model "${model}" is installed.`
            : `Ollama server reachable at ${baseUrl}. No models installed yet — pull a model with "ollama pull ${model}".`;
        }
      }
    } else {
      return NextResponse.json({ success: false, message: `Unknown provider: ${config.provider}` }, { status: 400, headers: CORS });
    }

    await supabase
      .from('ai_provider_configs')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: success ? 'success' : 'failure',
        last_test_message: message,
      })
      .eq('id', configId);

    return NextResponse.json({ success, message }, { headers: CORS });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: `Request failed: ${(err as Error).message}` },
      { status: 500, headers: CORS }
    );
  }
}

function stripModelsPrefix(id: string): string {
  return id.startsWith('models/') ? id.slice(7) : id;
}
