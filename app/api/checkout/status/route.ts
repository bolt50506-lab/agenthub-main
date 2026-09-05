import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const order = req.nextUrl.searchParams.get('order');
  if (!order) return NextResponse.json({ error: 'Missing order.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('public_checkout_orders')
    .select('order_number,status,currency,amount_cents,payment_method,submitted_at,fulfilled_at,rejection_reason')
    .eq('order_number', order)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  return NextResponse.json({
    orderNumber: data.order_number,
    status: data.status,
    currency: data.currency,
    amount: Number(data.amount_cents) / 100,
    paymentMethod: data.payment_method,
    submittedAt: data.submitted_at,
    fulfilledAt: data.fulfilled_at,
    rejectionReason: data.rejection_reason,
  });
}