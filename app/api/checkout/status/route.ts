
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order');
  if (!order) return NextResponse.json({ error: 'Missing order.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('public_checkout_orders')
    .select('order_number,status,fulfilled_at')
    .eq('order_number', order)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  return NextResponse.json({ orderNumber: data.order_number, status: data.status, fulfilledAt: data.fulfilled_at });
}
