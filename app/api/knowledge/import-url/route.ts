import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

function isSafeUrl(value: string) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return !(/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h));
  } catch { return false; }
}
function htmlToText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ').trim();
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const url = String(body.url || '').trim();
  const businessId = String(body.businessId || '');
  if (!url || !businessId || !isSafeUrl(url)) return NextResponse.json({ error: 'Please provide a valid public website URL.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: membership } = await supabase.from('business_members').select('id').eq('business_id', businessId).eq('user_id', userData.user.id).eq('status','active').maybeSingle();
  if (!membership) return NextResponse.json({ error: 'No access to this workspace.' }, { status: 403 });

  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'AgentHub Knowledge Importer/1.0' } });
    if (!res.ok) throw new Error('Website returned HTTP ' + res.status);
    const html = await res.text();
    const content = htmlToText(html).slice(0, 100000);
    if (content.length < 80) throw new Error('No useful text could be extracted from this page.');
    const host = new URL(url).hostname;
    const { error } = await supabase.from('knowledge_items').insert({
      business_id: businessId, title: 'Website: ' + host, category: 'business_info',
      content, tags: ['website', host], metadata: { source_url: url, imported_at: new Date().toISOString() }, status: 'active'
    });
    if (error) throw error;
    return NextResponse.json({ success: true, characters: content.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Website import failed' }, { status: 500 });
  }
}
