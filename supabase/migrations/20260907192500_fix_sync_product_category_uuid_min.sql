-- ============================================================================
-- Migration: Fix function min(uuid) does not exist in sync_product_category_id
--
-- Objective:
-- PostgreSQL lacks a built-in min(uuid) aggregate. In sync_product_category_id(),
-- min(c.id) was called, which fails when inserting or updating products.
-- Fix: Cast c.id to text for min() and cast result back to uuid (min(c.id::text)::uuid).
-- Also provide a native polymorphic min(uuid) aggregate as a resilient safety net.
-- ============================================================================

-- 1. Resilient safety net: define min(uuid) aggregate in public schema
CREATE OR REPLACE FUNCTION public.min_uuid_step(uuid, uuid)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN $1 IS NULL THEN $2
    WHEN $2 IS NULL THEN $1
    WHEN $1 < $2 THEN $1
    ELSE $2
  END;
$$;

DROP AGGREGATE IF EXISTS public.min(uuid);
CREATE AGGREGATE public.min(uuid) (
  sfunc = public.min_uuid_step,
  stype = uuid
);

-- 2. Update trigger function with explicit text cast and safe fallback
CREATE OR REPLACE FUNCTION public.sync_product_category_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_matching_count integer;
  v_resolved_id uuid;
  v_is_current_valid boolean := false;
BEGIN
  -- Check if supplied category_id is already valid for current category + sub_category
  IF NEW.category_id IS NOT NULL THEN
    IF NEW.sub_category IS NOT NULL AND trim(NEW.sub_category) <> '' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.categories c
        JOIN public.categories p ON p.id = c.parent_id
        WHERE c.id = NEW.category_id
          AND lower(trim(c.name)) = lower(trim(NEW.sub_category))
          AND (NEW.category IS NULL OR trim(NEW.category) = '' OR lower(trim(p.name)) = lower(trim(NEW.category)))
      ) INTO v_is_current_valid;
    ELSIF NEW.category IS NOT NULL AND trim(NEW.category) <> '' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.categories c
        WHERE c.id = NEW.category_id
          AND c.parent_id IS NULL
          AND lower(trim(c.name)) = lower(trim(NEW.category))
      ) INTO v_is_current_valid;
    END IF;

    -- If the current category_id is valid for the taxonomy, preserve it
    IF v_is_current_valid THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Resolution step A: Match by subcategory name AND parent category name
  IF NEW.sub_category IS NOT NULL AND trim(NEW.sub_category) <> '' THEN
    SELECT count(*), min(c.id::text)::uuid
    INTO v_matching_count, v_resolved_id
    FROM public.categories c
    JOIN public.categories p ON p.id = c.parent_id
    WHERE lower(trim(c.name)) = lower(trim(NEW.sub_category))
      AND (NEW.category IS NULL OR trim(NEW.category) = '' OR lower(trim(p.name)) = lower(trim(NEW.category)));

    IF v_matching_count = 1 THEN
      NEW.category_id := v_resolved_id;
      RETURN NEW;
    ELSIF v_matching_count > 1 THEN
      -- Ambiguous match across parents: do not guess arbitrarily
      RAISE WARNING 'Ambiguous subcategory match for sub_category=% category=%', NEW.sub_category, NEW.category;
      RETURN NEW;
    END IF;
  END IF;

  -- Resolution step B: Fallback to parent category only if no subcategory was specified
  IF (NEW.sub_category IS NULL OR trim(NEW.sub_category) = '')
     AND NEW.category IS NOT NULL AND trim(NEW.category) <> '' THEN
    SELECT count(*), min(c.id::text)::uuid
    INTO v_matching_count, v_resolved_id
    FROM public.categories c
    WHERE c.parent_id IS NULL
      AND lower(trim(c.name)) = lower(trim(NEW.category));

    IF v_matching_count = 1 THEN
      NEW.category_id := v_resolved_id;
      RETURN NEW;
    ELSIF v_matching_count > 1 THEN
      RAISE WARNING 'Ambiguous parent category match for category=%', NEW.category;
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
