-- Rollback: Revert seed_inventory_for_new_product to previous definition without color/variant_sku logic

CREATE OR REPLACE FUNCTION public.seed_inventory_for_new_product()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sz text;
BEGIN
  IF NEW.sizes IS NULL OR array_length(NEW.sizes, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH sz IN ARRAY NEW.sizes LOOP
    INSERT INTO public.inventory (
      product_doc_id, item, category, size,
      total, reserved, available, deleted, created_at, updated_at
    )
    SELECT
      NEW.id, NEW.name, NEW.category, sz,
      0, 0, 0, false, now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.product_doc_id = NEW.id AND i.size = sz
        AND (i.deleted IS NULL OR i.deleted = false)
    );
  END LOOP;

  RETURN NEW;
END;
$$;
