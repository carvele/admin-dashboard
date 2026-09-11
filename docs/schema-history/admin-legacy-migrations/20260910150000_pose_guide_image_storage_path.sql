-- Mirror only -- canonical copy lives in jezsy-mobile-app/supabase/migrations/
-- Makes pose image ownership metadata-driven instead of inferred from the
-- image_url string at delete time. Previously the admin page decided
-- whether it was safe to delete a pose's old image object by checking
-- whether the URL happened to contain the pose-images bucket's public-URL
-- marker -- correct today, but fragile: any future bucket rename, CDN
-- fronting, or URL rewrite would silently break the ownership check (either
-- leaking storage by never deleting, or worse, deleting something it
-- shouldn't). image_storage_path is instead set explicitly, once, at the
-- moment this feature itself uploads an object -- an authoritative marker,
-- not a runtime inference. NULL means "this feature does not own the
-- current image", which covers both the 4 originally-seeded poses (borrowed
-- product photos, never owned) and any row saved before this column
-- existed -- no backfill is possible or safe for that population, since we
-- cannot know retroactively which of them were actually uploaded here.
ALTER TABLE public.pose_guides
  ADD COLUMN IF NOT EXISTS image_storage_path text;

COMMENT ON COLUMN public.pose_guides.image_storage_path IS
  'Storage object path in the pose-images bucket, set only when this feature uploaded the current image_url. NULL means the image is borrowed/foreign or predates this column -- never delete it.';

-- Extend save_pose_guide to accept and persist the ownership marker
-- alongside the image URL, atomically with everything else it already
-- writes. Adding a 13th parameter makes this a distinct overload as far as
-- CREATE OR REPLACE is concerned, not a replacement of the 12-arg version --
-- drop the old signature explicitly so callers can't accidentally resolve
-- to it and so PostgREST's named-argument RPC lookup stays unambiguous.
DROP FUNCTION IF EXISTS public.save_pose_guide(
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[]
);

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
  p_product_ids uuid[] DEFAULT '{}',
  p_image_storage_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.pose_guides (
    id, name, category, image_url, description, occasion,
    style_tags, difficulty, is_featured, base_pose_type, sort_order, deleted,
    image_storage_path
  ) VALUES (
    p_id, p_name, p_category, p_image_url, p_description, p_occasion,
    p_style_tags, p_difficulty, p_is_featured, p_base_pose_type, p_sort_order, false,
    p_image_storage_path
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
    image_storage_path = EXCLUDED.image_storage_path,
    updated_at = now();

  DELETE FROM public.pose_guide_products
  WHERE pose_guide_id = p_id
    AND product_id <> ALL(p_product_ids);

  INSERT INTO public.pose_guide_products (pose_guide_id, product_id)
  SELECT p_id, pid
  FROM unnest(p_product_ids) AS pid
  ON CONFLICT (pose_guide_id, product_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.save_pose_guide(
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[], text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_pose_guide(
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[], text
) TO authenticated;
