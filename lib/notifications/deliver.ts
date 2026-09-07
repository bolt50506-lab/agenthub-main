export function formatReceiptMessage(payload: any) {
  const amount = payload?.amount != null ? `${payload.currency || ''} ${Number(payload.amount).toLocaleString()}`.trim() : '';
  const lines = [
    'Payment Receipt',
    payload?.business_name ? `Business: ${payload.business_name}` : null,
    payload?.receipt_number ? `Receipt: ${payload.receipt_number}` : null,
    payload?.invoice_number ? `Invoice: ${payload.invoice_number}` : null,
    amount ? `Amount: ${amount}` : null,
    payload?.valid_until ? `Valid until: ${new Date(payload.valid_until).toLocaleDateString()}` : null,
    payload?.message || 'Your payment has been approved successfully.',
  ].filter(Boolean);
  return lines.join('\n');
}

export async function deliverPendingNotifications(supabase: any, limit = 25) {
  const { data: rows } = await supabase.from('channel_notifications')
    .select('*').eq('status','pending').order('created_at',{ascending:true}).limit(limit);
  let sent = 0, failed = 0;

  for (const row of rows || []) {
    try {
      const channel = String(row.recipient_channel || '').toLowerCase();
      const message = formatReceiptMessage(row.payload || {});
      if (channel === 'whatsapp') {
        const { data: session } = await supabase.from('whatsapp_sessions')
          .select('session_id,status').eq('business_id',row.business_id).eq('status','connected').order('updated_at',{ascending:false}).limit(1).maybeSingle();
        const base = process.env.WHATSAPP_SERVICE_URL;
        if (!base || !session?.session_id) throw new Error('No connected WhatsApp delivery session');
        const digits = String(row.recipient_address || '').replace(/[^0-9]/g,'');
        if (!digits) throw new Error('WhatsApp recipient is missing');
        const to = digits.includes('@') ? row.recipient_address : digits + '@s.whatsapp.net';
        const response = await fetch(base.replace(/\/$/,'') + '/sessions/' + encodeURIComponent(session.session_id) + '/send', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({to,message}),
        });
        if (!response.ok) throw new Error('WhatsApp delivery returned HTTP ' + response.status);
      } else if (channel === 'instagram' || channel === 'facebook_messenger' || channel === 'facebook') {
        const integrationType = channel === 'instagram' ? 'instagram' : 'facebook_messenger';
        const { data: integration } = await supabase.from('integrations').select('config,status')
          .eq('business_id',row.business_id).eq('type',integrationType).maybeSingle();
        const url = integration?.config?.send_webhook_url;
        if (!url || integration?.status !== 'connected') throw new Error('Channel delivery is not connected');
        const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:row.recipient_address,message,type:'payment_receipt',payload:row.payload})});
        if (!response.ok) throw new Error(channel + ' delivery returned HTTP ' + response.status);
      } else {
        throw new Error('Unsupported notification channel: ' + channel);
      }
      await supabase.from('channel_notifications').update({status:'sent',sent_at:new Date().toISOString(),error_message:null}).eq('id',row.id);
      sent++;
    } catch (error) {
      await supabase.from('channel_notifications').update({status:'failed',error_message:error instanceof Error?error.message:String(error)}).eq('id',row.id);
      failed++;
    }
  }
  return { sent, failed, processed: (rows || []).length };
}