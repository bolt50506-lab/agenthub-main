import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[Public plans] Supabase error:', error);
      return NextResponse.json({ plans: [], error: 'Unable to load plans' }, { status: 500 });
    }

    return NextResponse.json({ plans: data ?? [] }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[Public plans] Failed:', error);
    return NextResponse.json({ plans: [], error: 'Unable to load plans' }, { status: 500 });
  }
}
