import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const orderNumber = String(form.get('order') || '');
    const reference = String(form.get('reference') || '').trim();
    const file = form.get('screenshot');

    if (!orderNumber || !(file instanceof File)) {
      return NextResponse.json({ error: 'Order number and payment screenshot are required.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Please upload an image screenshot.' }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'Screenshot must be 8 MB or smaller.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: order } = await supabase
      .from('public_checkout_orders')
      .select('id,status')
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (!['pending_payment','rejected'].includes(order.status)) {
      return NextResponse.json({ error: 'This payment proof has already been submitted.' }, { status: 409 });
    }

    const extension = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
    const path = `${order.id}/${Date.now()}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await supabase
      .from('public_checkout_orders')
      .update({
        payment_screenshot_path: path,
        payment_reference: reference || null,
        status: 'pending_review',
        submitted_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', order.id);

    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true, status: 'pending_review' });
  } catch (error) {
    console.error('[Manual Payment Upload] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to upload payment proof.' }, { status: 500 });
  }
}