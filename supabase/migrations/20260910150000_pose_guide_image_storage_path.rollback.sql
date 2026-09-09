-- Mirror only -- canonical copy lives in jezsy-mobile-app/supabase/migrations/
DROP FUNCTION IF EXISTS public.save_pose_guide(
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[], text
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
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_pose_guide(
  text, text, text, text, text, text, text[], text, boolean, text, integer, uuid[]
) TO authenticated;

ALTER TABLE public.pose_guides DROP COLUMN IF EXISTS image_storage_path;
