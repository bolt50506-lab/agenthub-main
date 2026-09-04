-- Public checkout orders are created server-side before redirecting to the payment gateway.
-- No browser policy grants access; checkout API and payment webhook use the service role.

CREATE TABLE IF NOT EXISTS public_checkout_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  business_name text NOT NULL,
  country_code text NOT NULL DEFAULT 'PK',
  encrypted_password text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','fulfilled')),
  gateway text NOT NULL DEFAULT 'paynicorn',
  gateway_transaction_id text,
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_checkout_orders_status ON public_checkout_orders(status);
CREATE INDEX IF NOT EXISTS idx_public_checkout_orders_gateway_txn ON public_checkout_orders(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_public_checkout_orders_email ON public_checkout_orders(customer_email);

ALTER TABLE public_checkout_orders ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS public_checkout_orders_updated_at ON public_checkout_orders;
CREATE TRIGGER public_checkout_orders_updated_at
  BEFORE UPDATE ON public_checkout_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
