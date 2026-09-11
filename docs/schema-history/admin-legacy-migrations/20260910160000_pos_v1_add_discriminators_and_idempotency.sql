-- POS v1 (Migration-1, part 1 of 2): explicit transaction classification and
-- idempotency key for public.reservations. Columns are nullable/unconstrained
-- until back-filled and every writer is confirmed to set them (see the M5
-- writer-audit gate in the implementation plan) -- existing writers that omit
-- them keep their current behavior unchanged.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS purchase_mode TEXT,
  ADD COLUMN IF NOT EXISTS sales_channel TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_idempotency_key_key'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_purchase_mode') THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT chk_purchase_mode CHECK (
        purchase_mode IS NULL OR purchase_mode IN ('reservation','walk_in')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_channel') THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT chk_sales_channel CHECK (
        sales_channel IS NULL OR sales_channel IN ('mobile','boutique_pos')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_method') THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT chk_payment_method CHECK (
        payment_method IS NULL OR payment_method IN ('cash','card','ewallet')
      );
  END IF;
END $$;
