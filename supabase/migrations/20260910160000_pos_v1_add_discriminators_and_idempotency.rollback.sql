ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS chk_purchase_mode,
  DROP CONSTRAINT IF EXISTS chk_sales_channel,
  DROP CONSTRAINT IF EXISTS chk_payment_method,
  DROP CONSTRAINT IF EXISTS reservations_idempotency_key_key,
  DROP COLUMN IF EXISTS purchase_mode,
  DROP COLUMN IF EXISTS sales_channel,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS idempotency_key;
