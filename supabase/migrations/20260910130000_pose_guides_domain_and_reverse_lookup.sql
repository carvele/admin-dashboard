-- Mirror only -- canonical copy lives in jezsy-mobile-app/supabase/migrations/
-- (pose_guides/pose_guide_products originate and are tracked there). Applied
-- to the shared live DB from that repo; kept here for discoverability only.
--
-- Domain contract for pose_guides.occasion/difficulty. Previously enforced
-- only by convention -- a mismatched occasion string already silently made
-- a pose unfilterable once this session (fixed in
-- 20260909170000_populate_style_inspiration_content.sql). occasion values
-- must match StyleGallery.tsx's OCCASIONS filter chips exactly.
ALTER TABLE public.pose_guides
  ADD CONSTRAINT pose_guides_occasion_check
    CHECK (occasion IS NULL OR occasion IN ('Party','Formal','Wedding','Date Night','Casual','Festival')),
  ADD CONSTRAINT pose_guides_difficulty_check
    CHECK (difficulty IS NULL OR difficulty IN ('easy','intermediate','pro'));

-- "Styled Looks" on the product detail page: which curated looks feature a
-- given product. Deliberately SECURITY INVOKER (not DEFINER), mirroring
-- get_public_outfits_for_product -- it does no elevated-privilege work, both
-- pose_guides and pose_guide_products are already fully public-SELECT, so
-- this RPC can't return anything a direct SELECT wouldn't already allow.
-- sort_order was an unused column on pose_guides until now; ordering by it
-- first gives admins deliberate editorial control instead of an implicit
-- created_at ordering.
CREATE OR REPLACE FUNCTION public.get_pose_guides_for_product(p_product_id uuid)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  category text,
  occasion text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  -- No DISTINCT needed: pose_guide_products has UNIQUE(pose_guide_id,
  -- product_id), so this join can return at most one row per pose_guide
  -- for a given product already.
  SELECT
    pg.id,
    pg.name,
    pg.image_url,
    pg.category,
    pg.occasion
  FROM public.pose_guides pg
  JOIN public.pose_guide_products pgp ON pgp.pose_guide_id = pg.id
  WHERE pgp.product_id = p_product_id
    AND COALESCE(pg.deleted, false) = false
  ORDER BY pg.sort_order ASC NULLS LAST, pg.is_featured DESC, pg.created_at DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.get_pose_guides_for_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pose_guides_for_product(uuid) TO authenticated, anon;
