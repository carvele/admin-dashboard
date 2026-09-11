-- ============================================================================
-- Migration: Strengthen inventory seed trigger with color & variant_sku
--
-- Objective:
-- Ensure that when products are created, their initial inventory rows
-- inherit the product's primary color and form a properly formatted variant_sku
-- rather than defaulting to empty color (which renders as 'Standard').
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_inventory_for_new_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sz text;
  prod_color text;
  clean_code text;
  clean_color text;
  v_sku text;
BEGIN
  -- Skip if the product has no sizes declared
  IF NEW.sizes IS NULL OR array_length(NEW.sizes, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  prod_color := COALESCE(NULLIF(TRIM(NEW.color), ''), NULLIF(TRIM(NEW.base_color), ''), '');

  -- One inventory row per declared size (skip if already exists)
  FOREACH sz IN ARRAY NEW.sizes LOOP
    IF NEW.style_code IS NOT NULL AND TRIM(NEW.style_code) != '' THEN
      clean_code := UPPER(TRIM(NEW.style_code));
      IF prod_color != '' THEN
        clean_color := UPPER(REGEXP_REPLACE(prod_color, '[^A-Za-z0-9]+', '', 'g'));
        v_sku := clean_code || '-' || clean_color || '-' || UPPER(TRIM(sz));
      ELSE
        v_sku := clean_code || '-' || UPPER(TRIM(sz));
      END IF;
    ELSE
      v_sku := NULL;
    END IF;

    INSERT INTO public.inventory (
      product_doc_id, item, category, size, color, pattern,
      sku, variant_sku,
      total, reserved, available, deleted, created_at, updated_at
    )
    SELECT
      NEW.id, NEW.name, NEW.category, sz, prod_color, '',
      NEW.style_code, v_sku,
      0, 0, 0, false, now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.product_doc_id = NEW.id AND i.size = sz
        AND (i.color = prod_color OR (i.color IS NULL AND prod_color = ''))
        AND (i.deleted IS NULL OR i.deleted = false)
    );
  END LOOP;

  RETURN NEW;
END;
$$;
