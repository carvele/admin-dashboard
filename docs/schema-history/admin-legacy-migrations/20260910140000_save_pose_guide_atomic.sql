-- Mirror only -- canonical copy lives in jezsy-mobile-app/supabase/migrations/
-- Atomic write path for the Style Inspiration admin page. Previously the
-- client upserted pose_guides then ran a separate Promise.all of
-- pose_guide_products link/unlink calls -- a failure between those two
-- steps could leave a pose saved with a stale product list. Wrapping both
-- in one PL/pgSQL function makes the whole edit a single transaction:
-- Postgres implicitly wraps one function call in a transaction, so either
-- everything below commits or none of it does.
--
-- SECURITY INVOKER, matching get_pose_guides_for_product: both tables
-- already carry a working is_staff_or_admin() FOR ALL policy, so RLS is
-- the real boundary here, not this function.
CREATE OR REPLACE FUNCTION public.save_pose_guide(
  p_id text,
  p_name text,
  p_category text,
  p_image_url text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_occasion text DEFAULT NULL,
  p_style_tags text[] DEFAULT '{}',
  p_difficulty text DEFAULT 'easy',
  p_is_featured boolean DEFAULT false,
  p_base_pose_type text DEFAULT 'front',
  p_sort_order integer DEFAULT 0,
  p_product_ids uuid[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.pose_guides (
    id, name, category, image_url, description, occasion,
    style_tags, difficulty, is_featured, base_pose_type, sort_order, deleted
  ) VALUES (
    p_id, p_name, p_category, p_image_url, p_description, p_occasion,
    p_style_tags, p_difficulty, p_is_featured, p_base_pose_type, p_sort_order, false
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    image_url = EXCLUDED.image_url,
    description = EXCLUDED.description,
    occasion = EXCLUDED.occasion,
    style_tags = EXCLUDED.style_tags,
    difficulty = EXCLUDED.difficulty,
    is_featured = EXCLUDED.is_featured,
    base_pose_type = EXCLUDED.base_pose_type,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

  -- Set-reconciliation, not blind unlink/relink: only rows actually absent
  -- from the incoming set are removed, only rows actually missing are added.
  DELETE FROM public.pose_guide_products
  WHERE pose_guide_id = p_id
    AND product_id <> ALL(p_product_ids);

  INSERT INTO public.pose_guide_products (pose_guide_id, product_id)
  SELECT p_id, pid
  FROM unnest(p_product_ids) AS pid
  ON CONFLICT (pose_guide_id, product_id) DO NOTHING;
END;
$$;

-- Supabase grants EXECUTE directly to anon/authenticated on function
-- creation (ALTER DEFAULT PRIVILEGES), not just via PUBLIC -- revoking
-- from PUBLIC alone leaves anon with access (confirmed live: an adversarial
-- test caught this before this migration ever shipped). This is a
-- staff-only write path, so anon must be revoked explicitly too.
REVOKE ALL ON FUNCTION public.save_pose_guide(
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_pose_guide(
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[]
) TO authenticated;
