DROP FUNCTION IF EXISTS public.get_pose_guides_for_product(uuid);

ALTER TABLE public.pose_guides
  DROP CONSTRAINT IF EXISTS pose_guides_occasion_check,
  DROP CONSTRAINT IF EXISTS pose_guides_difficulty_check;
