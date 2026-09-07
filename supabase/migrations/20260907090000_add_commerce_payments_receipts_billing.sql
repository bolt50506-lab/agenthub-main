-- Unified commerce, customer payments, receipts and subscription billing.

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  duration_minutes integer,
  advance_required numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_business ON services(business_id);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name text,
  ADD COLUMN IF NOT EXISTS service_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS advance_required numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  customer_name text,
  customer_phone text,
  customer_email text,
  channel text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'inquiry' CHECK (status IN ('inquiry','quotation_sent','awaiting_payment','confirmed','processing','shipped','delivered','cancelled')),
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid','refunded')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_orders_business_created ON orders(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON orders(business_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  item_type text NOT NULL DEFAULT 'product' CHECK (item_type IN ('product','service','custom')),
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS business_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  method_type text NOT NULL,
  provider text,
  account_name text,
  account_number text,
  instructions text,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_payment_methods_business ON business_payment_methods(business_id);

CREATE TABLE IF NOT EXISTS customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'manual',
  payer_name text,
  payer_contact text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  payment_method text,
  payment_reference text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','refunded')),
  proof_path text,
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_payments_business_status ON customer_payments(business_id, status);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  customer_payment_id uuid REFERENCES customer_payments(id) ON DELETE SET NULL,
  subscription_invoice_id uuid,
  customer_name text,
  customer_contact text,
  channel text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  issued_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (business_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES business_subscriptions(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','void','overdue')),
  due_date timestamptz,
  paid_at timestamptz,
  checkout_order_id uuid REFERENCES public_checkout_orders(id) ON DELETE SET NULL,
  receipt_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_business_created ON subscription_invoices(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  recipient_channel text NOT NULL,
  recipient_address text,
  template_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_notifications_pending ON channel_notifications(status, created_at);

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_receipts_subscription_invoice_fk') THEN
    ALTER TABLE payment_receipts ADD CONSTRAINT payment_receipts_subscription_invoice_fk FOREIGN KEY (subscription_invoice_id) REFERENCES subscription_invoices(id) ON DELETE SET NULL;
  END IF;
END $;

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_notifications ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['services','orders','business_payment_methods','customer_payments','payment_receipts','subscription_invoices','channel_notifications'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_member_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (is_business_member(business_id) OR is_super_admin()) WITH CHECK (is_business_member(business_id) OR is_super_admin())', t || '_member_all', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS order_items_member_all ON order_items;
CREATE POLICY order_items_member_all ON order_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id=order_id AND (is_business_member(o.business_id) OR is_super_admin())))
WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id=order_id AND (is_business_member(o.business_id) OR is_super_admin())));

CREATE OR REPLACE FUNCTION update_commerce_payment_totals()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_total numeric(12,2); v_paid numeric(12,2); v_order uuid;
BEGIN
  v_order := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order IS NOT NULL THEN
    SELECT total_amount INTO v_total FROM orders WHERE id=v_order;
    SELECT COALESCE(sum(amount),0) INTO v_paid FROM customer_payments WHERE order_id=v_order AND status='approved';
    UPDATE orders SET amount_paid=v_paid, balance_due=GREATEST(v_total-v_paid,0), payment_status=CASE WHEN v_paid<=0 THEN 'unpaid' WHEN v_paid>=v_total THEN 'paid' ELSE 'partial' END, updated_at=now() WHERE id=v_order;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS trg_customer_payments_totals ON customer_payments;
CREATE TRIGGER trg_customer_payments_totals AFTER INSERT OR UPDATE OR DELETE ON customer_payments FOR EACH ROW EXECUTE FUNCTION update_commerce_payment_totals();

CREATE OR REPLACE FUNCTION update_appointment_payment_totals()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_paid numeric(12,2); v_apt uuid;
BEGIN
  v_apt := COALESCE(NEW.appointment_id, OLD.appointment_id);
  IF v_apt IS NOT NULL THEN
    SELECT COALESCE(sum(amount),0) INTO v_paid FROM customer_payments WHERE appointment_id=v_apt AND status='approved';
    UPDATE appointments SET amount_paid=v_paid, payment_status=CASE WHEN v_paid<=0 THEN 'unpaid' WHEN service_price IS NOT NULL AND v_paid>=service_price THEN 'paid' ELSE 'partial' END WHERE id=v_apt;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS trg_customer_payments_appointments ON customer_payments;
CREATE TRIGGER trg_customer_payments_appointments AFTER INSERT OR UPDATE OR DELETE ON customer_payments FOR EACH ROW EXECUTE FUNCTION update_appointment_payment_totals();