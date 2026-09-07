function formatReceiptMessage(payload: any) {
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

function escapePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function buildReceiptPdf(payload: any) {
  const lines = [
    'AgentHub AI - Payment Receipt',
    '',
    `Receipt Number: ${payload?.receipt_number || '-'}`,
    `Invoice Number: ${payload?.invoice_number || '-'}`,
    `Business: ${payload?.business_name || '-'}`,
    `Customer: ${payload?.customer_name || '-'}`,
    `Contact: ${payload?.customer_contact || '-'}`,
    `Plan: ${payload?.plan_id || payload?.plan || '-'}`,
    `Amount Paid: ${payload?.currency || ''} ${Number(payload?.amount || 0).toLocaleString()}`,
    `Payment Date: ${payload?.issued_at ? new Date(payload.issued_at).toLocaleString() : new Date().toLocaleString()}`,
    `Valid Until: ${payload?.valid_until ? new Date(payload.valid_until).toLocaleString() : '-'}`,
    '',
    'Payment status: PAID / APPROVED',
    'This receipt was generated automatically after payment approval.',
  ];

  const text = lines.map((line, index) => `${index === 0 ? '/F1 18 Tf' : '/F1 11 Tf'} 50 ${760 - index * 28} Td (${escapePdfText(line)}) Tj`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(text + '\n', 'binary')} >>\nstream\nBT\n${text}\nET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

export async function deliverPendingNotifications(supabase: any, limit = 25, businessId?: string) {
  let query = supabase.from('channel_notifications').select('*').eq('status','pending');
  if (businessId) query = query.eq('business_id', businessId);
  const { data: rows } = await query.order('created_at',{ascending:true}).limit(limit);
  let sent = 0, failed = 0;

  for (const row of rows || []) {
    try {
      const channel = String(row.recipient_channel || '').toLowerCase();
      const payload = row.payload || {};
      const message = formatReceiptMessage(payload);
      if (channel === 'whatsapp') {
        const { data: session } = await supabase.from('whatsapp_sessions')
          .select('session_id,status').eq('business_id',row.business_id).eq('status','connected').order('updated_at',{ascending:false}).limit(1).maybeSingle();
        const base = process.env.WHATSAPP_SERVICE_URL;
        if (!base || !session?.session_id) throw new Error('No connected WhatsApp delivery session');
        const digits = String(row.recipient_address || '').replace(/[^0-9]/g,'');
        if (!digits) throw new Error('WhatsApp recipient is missing');
        const to = digits.includes('@') ? row.recipient_address : digits + '@s.whatsapp.net';
        const receiptPdf = payload.receipt_number ? buildReceiptPdf({ ...payload, issued_at: payload.issued_at || row.created_at }) : null;
        const response = await fetch(base.replace(/\/$/,'') + '/sessions/' + encodeURIComponent(session.session_id) + '/send', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            to,
            message,
            ...(receiptPdf ? {
              document_base64: receiptPdf.toString('base64'),
              document_mimetype: 'application/pdf',
              document_filename: `${payload.receipt_number}.pdf`,
              document_caption: 'Your payment receipt',
            } : {}),
          }),
        });
        if (!response.ok) throw new Error('WhatsApp delivery returned HTTP ' + response.status);
      } else if (channel === 'instagram' || channel === 'facebook_messenger' || channel === 'facebook') {
        const integrationType = channel === 'instagram' ? 'instagram' : 'facebook_messenger';
        const { data: integration } = await supabase.from('integrations').select('config,status')
          .eq('business_id',row.business_id).eq('type',integrationType).maybeSingle();
        const url = integration?.config?.send_webhook_url;
        if (!url || integration?.status !== 'connected') throw new Error('Channel delivery is not connected');
        const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:row.recipient_address,message,type:'payment_receipt',payload})});
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
