-- Migration: Cascade soft-delete from products to inventory via trigger
-- Replaces the unreliable client-side cascade in supabaseService.js
-- that could leave orphaned active inventory if the network dropped
-- between the two sequential requests.

CREATE OR REPLACE FUNCTION cascade_soft_delete_inventory()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted = true AND OLD.deleted IS DISTINCT FROM true THEN
    UPDATE inventory
    SET deleted = true,
        deleted_at = COALESCE(NEW.deleted_at, NOW()),
        updated_at = NOW()
    WHERE product_doc_id = NEW.id
      AND deleted IS DISTINCT FROM true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_soft_delete_inventory ON products;
CREATE TRIGGER trg_cascade_soft_delete_inventory
  AFTER UPDATE OF deleted ON products
  FOR EACH ROW
  WHEN (NEW.deleted = true)
  EXECUTE FUNCTION cascade_soft_delete_inventory();
