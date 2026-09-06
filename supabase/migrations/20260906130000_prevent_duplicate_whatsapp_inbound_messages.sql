-- Prevent concurrent duplicate webhook deliveries from generating two AI replies.
-- The same WhatsApp message may be emitted more than once by the provider.
CREATE UNIQUE INDEX IF NOT EXISTS messages_unique_whatsapp_inbound_message_id
ON public.messages (business_id, (metadata->>'whatsapp_message_id'))
WHERE is_inbound = true
  AND metadata ? 'whatsapp_message_id'
  AND NULLIF(metadata->>'whatsapp_message_id','') IS NOT NULL;
