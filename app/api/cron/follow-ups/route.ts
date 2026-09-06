import { NextRequest, NextResponse } from 'next/server';

// Legacy follow-up sender intentionally disabled.
// Follow-ups are delivered only by /api/cron/followup-schedule +
// /api/cron/followup-automation, which uses the atomic task-claim flow.
// Keeping this endpoint as a no-op prevents any stale cron configuration
// from creating a second sender path.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const authorization = req.headers.get('authorization');
  if (secret && authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    disabled: true,
    sent: 0,
    reason: 'Legacy follow-up sender disabled; use followup-automation',
  });
}
