import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { deliverPendingNotifications } from '@/lib/notifications/deliver';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const businessId = String((await req.json().catch(() => ({}))).business_id || '');
  if (!token || !businessId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase.from('business_members').select('id')
    .eq('business_id', businessId).eq('user_id', userData.user.id).eq('status','active').maybeSingle();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await deliverPendingNotifications(supabase, 10, businessId);
  return NextResponse.json({ ok: true, ...result });
}