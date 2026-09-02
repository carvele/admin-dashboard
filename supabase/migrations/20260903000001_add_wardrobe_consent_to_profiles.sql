-- 20260903000001_add_wardrobe_consent_to_profiles.sql
-- Add privacy consent flag for Digital Wardrobe sharing with JezSy Stylists

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_wardrobe_shared BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.profiles.is_wardrobe_shared IS 'Privacy flag: true if customer explicitly opts in to share their digital wardrobe with JezSy stylists.';
