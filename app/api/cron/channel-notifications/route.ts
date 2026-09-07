import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { deliverPendingNotifications } from '@/lib/notifications/deliver';

export const runtime = 'nodejs';

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.AGENTHUB_WEBHOOK_SECRET;
  return !!secret && req.headers.get('authorization') === 'Bearer ' + secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await deliverPendingNotifications(createServiceClient(), 50);
  return NextResponse.json({ ok: true, ...result });
}