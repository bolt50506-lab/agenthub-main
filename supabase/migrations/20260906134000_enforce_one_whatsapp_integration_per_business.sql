-- A QR session and its reply settings must resolve to one unambiguous
-- WhatsApp integration per business.
CREATE UNIQUE INDEX IF NOT EXISTS integrations_one_whatsapp_per_business
ON public.integrations (business_id)
WHERE type = 'whatsapp';
