import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'https://agenthub-whatsapp-service-production.up.railway.app';
const WHATSAPP_SECRET = process.env.AGENTHUB_WEBHOOK_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || '';

type Channel = 'whatsapp' | 'facebook_messenger' | 'instagram';
type Target = { id: string; name: string; username?: string | null; type: 'group' | 'page' | 'instagram' };
type IntegrationConfig = Record<string, any>;

async function getBusinessContext(businessId: string) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const };
  const service = createServiceClient();
  const { data: membership } = await service.from('business_members').select('business_id').eq('business_id', businessId).eq('user_id', user.id).maybeSingle();
  if (!membership) return { error: 'Not authorized' as const };
  return { service };
}

async function graphJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Meta Graph request failed (${response.status})`);
  return data;
}

async function discoverMetaTargets(channel: 'facebook_messenger' | 'instagram', config: IntegrationConfig): Promise<Target[]> {
  const token = config.user_access_token || config.meta_user_access_token || config.access_token || config.page_access_token;
  const targets: Target[] = [];
  if (token) {
    try {
      const fields = channel === 'instagram' ? 'id,name,access_token,tasks,instagram_business_account' : 'id,name,access_token,tasks';
      const data = await graphJson(`https://graph.facebook.com/v18.0/me/accounts?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`);
      const pages = Array.isArray(data?.data) ? data.data : [];
      for (const page of pages) {
        if (!page?.id) continue;
        const ig = page.instagram_business_account;
        if (channel === 'instagram') {
          if (ig?.id) targets.push({ id: String(ig.id), name: String(page.name || `Instagram ${ig.id}`), type: 'instagram' });
        } else {
          targets.push({ id: String(page.id), name: String(page.name || `Facebook Page ${page.id}`), type: 'page' });
        }
      }
      const pageTargets = pages.filter((page: any) => page?.id && page?.access_token).map((page: any) => ({
        id: String(channel === 'instagram' ? page.instagram_business_account?.id || page.id : page.id),
        page_id: String(page.id), name: String(page.name || page.id), access_token: String(page.access_token),
        instagram_account_id: page.instagram_business_account?.id ? String(page.instagram_business_account.id) : null,
      }));
      if (pageTargets.length) config.page_targets = pageTargets;
    } catch (error) {
      console.warn(`[Targets] Meta discovery failed for ${channel}:`, error instanceof Error ? error.message : error);
    }
  }
  if (!targets.length) {
    if (channel === 'facebook_messenger' && config.page_id) targets.push({ id: String(config.page_id), name: String(config.page_name || `Facebook Page ${config.page_id}`), type: 'page' });
    if (channel === 'instagram' && config.instagram_account_id) targets.push({ id: String(config.instagram_account_id), name: String(config.instagram_account_name || `Instagram ${config.instagram_account_id}`), type: 'instagram' });
  }
  return targets;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get('business_id');
  const channel = url.searchParams.get('channel') as Channel | null;
  if (!businessId || !channel) return NextResponse.json({ error: 'business_id and channel are required' }, { status: 400 });
  const context = await getBusinessContext(businessId);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.error === 'Not authenticated' ? 401 : 403 });
  const { service } = context;

  if (channel === 'whatsapp') {
    const { data: session } = await service.from('whatsapp_sessions').select('id, session_id, status').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!session?.session_id) return NextResponse.json({ connected: false, targets: [], target_mode: 'all', selected_ids: [] });
    try {
      const response = await fetch(`${WHATSAPP_SERVICE_URL}/groups?session_id=${encodeURIComponent(session.session_id)}`, { headers: WHATSAPP_SECRET ? { Authorization: `Bearer ${WHATSAPP_SECRET}` } : undefined, cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) return NextResponse.json({ connected: session.status === 'connected', targets: [], target_mode: 'all', selected_ids: [], error: data?.message || 'Unable to load WhatsApp groups' }, { status: 502 });
      const { data: rule } = await service.from('group_rules').select('group_target_mode, selected_group_ids').eq('business_id', businessId).maybeSingle();
      const groupTargetMode = rule?.group_target_mode || 'all';
      const selectedGroupIds = Array.isArray(rule?.selected_group_ids) ? rule.selected_group_ids : [];
      return NextResponse.json({ connected: true, targets: (data?.groups || []).map((g: any) => ({ id: String(g.id), name: String(g.name || g.id), type: 'group' })), target_mode: groupTargetMode, selected_ids: selectedGroupIds });
    } catch (error) {
      return NextResponse.json({ connected: session.status === 'connected', targets: [], target_mode: 'all', selected_ids: [], error: error instanceof Error ? error.message : 'Unable to load WhatsApp groups' }, { status: 502 });
    }
  }

  const { data: integrations } = await service.from('integrations').select('id, config, status').eq('business_id', businessId).eq('type', channel).eq('status', 'connected');
  if (!integrations?.length) return NextResponse.json({ connected: false, targets: [], target_mode: 'all', selected_ids: [] });
  const base = integrations[0];
  const config = { ...((base.config || {}) as IntegrationConfig) };
  const targets = await discoverMetaTargets(channel, config);
  if (config.page_targets && JSON.stringify(config.page_targets) !== JSON.stringify((base.config || {}).page_targets || null)) await service.from('integrations').update({ config }).eq('id', base.id);
  const selectedIds = [...new Set(integrations.flatMap((row: any) => { const rowConfig = row.config || {}; const id = channel === 'facebook_messenger' ? rowConfig.page_id : rowConfig.instagram_account_id; return id ? [String(id)] : []; }))];
  return NextResponse.json({ connected: true, targets, target_mode: config.target_mode === 'selected' ? 'selected' : 'all', selected_ids: config.target_mode === 'selected' ? selectedIds : [] });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const businessId = body?.business_id as string | undefined;
  const channel = body?.channel as Channel | undefined;
  const targetMode = body?.target_mode === 'selected' ? 'selected' : 'all';
  const selectedIds = Array.isArray(body?.selected_ids) ? body.selected_ids.map(String).filter(Boolean) : [];
  if (!businessId || !channel) return NextResponse.json({ error: 'business_id and channel are required' }, { status: 400 });
  if (targetMode === 'selected' && !selectedIds.length) return NextResponse.json({ error: 'Select at least one target or choose All.' }, { status: 400 });
  const context = await getBusinessContext(businessId);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.error === 'Not authenticated' ? 401 : 403 });
  const { service } = context;

  if (channel === 'whatsapp') {
    const { data: existing } = await service.from('group_rules').select('id').eq('business_id', businessId).maybeSingle();
    const payload = { business_id: businessId, group_target_mode: targetMode, selected_group_ids: targetMode === 'selected' ? selectedIds : [] };
    const result = existing ? await service.from('group_rules').update(payload).eq('id', existing.id) : await service.from('group_rules').insert(payload);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: integrations } = await service.from('integrations').select('id, name, config, status').eq('business_id', businessId).eq('type', channel);
  const connected = (integrations || []).filter((row: any) => row.status === 'connected');
  if (!connected.length) return NextResponse.json({ error: `No connected ${channel} integration found.` }, { status: 404 });
  const base = connected[0];
  const baseConfig = { ...((base.config || {}) as IntegrationConfig) };
  const pageTargets = Array.isArray(baseConfig.page_targets) ? baseConfig.page_targets : [];
  const targetField = channel === 'facebook_messenger' ? 'page_id' : 'instagram_account_id';

  if (targetMode === 'all') {
    if (pageTargets.length) {
      for (const target of pageTargets) {
        const id = String(target.id || '');
        if (!id) continue;
        const existing = connected.find((row: any) => String(row.config?.[targetField] || '') === id);
        const targetConfig = targetField === 'page_id'
          ? { page_id: String(target.page_id || id), page_name: target.name, access_token: target.access_token, page_access_token: target.access_token }
          : { instagram_account_id: id, instagram_account_name: target.name, page_id: String(target.page_id || ''), access_token: target.access_token, page_access_token: target.access_token };
        const nextConfig = { ...baseConfig, ...targetConfig, target_mode: 'all', selected_target_ids: [] };
        if (existing) await service.from('integrations').update({ name: target.name || existing.name, status: 'connected', config: nextConfig }).eq('id', existing.id);
        else await service.from('integrations').insert({ business_id: businessId, type: channel, name: target.name || `${channel} target`, status: 'connected', config: nextConfig });
      }
    } else {
      await service.from('integrations').update({ config: { ...baseConfig, target_mode: 'all', selected_target_ids: [] } }).eq('id', base.id);
    }
    return NextResponse.json({ ok: true });
  }

  for (const row of connected) {
    const id = String(row.config?.[targetField] || '');
    if (id && !selectedIds.includes(id)) await service.from('integrations').update({ status: 'not_connected' }).eq('id', row.id);
  }

  for (const id of selectedIds) {
    const target = pageTargets.find((item: any) => String(item.id || '') === id);
    const existing = connected.find((row: any) => String(row.config?.[targetField] || '') === id);
    if (existing) {
      await service.from('integrations').update({ status: 'connected', config: { ...(existing.config || {}), target_mode: 'selected', selected_target_ids: selectedIds } }).eq('id', existing.id);
      continue;
    }
    if (!target?.access_token) continue;
    const nextConfig = { ...baseConfig, target_mode: 'selected', selected_target_ids: selectedIds };
    if (channel === 'facebook_messenger') {
      nextConfig.page_id = String(target.page_id || id); nextConfig.page_name = target.name; nextConfig.access_token = target.access_token; nextConfig.page_access_token = target.access_token;
    } else {
      nextConfig.instagram_account_id = id; nextConfig.instagram_account_name = target.name; nextConfig.page_id = String(target.page_id || ''); nextConfig.access_token = target.access_token; nextConfig.page_access_token = target.access_token;
    }
    await service.from('integrations').insert({ business_id: businessId, type: channel, name: target.name || `${channel} target`, status: 'connected', config: nextConfig });
  }

  return NextResponse.json({ ok: true });
}
