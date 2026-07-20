-- Migration: Tighten overly-broad RLS policies and consolidate duplicates
-- Findings from docs/ARCHITECTURE.md audit (2026-07-19):
--   1. profiles had "read access for all users" (using true) -- exposed every
--      user's email and expo_push_token to any authenticated/anon client.
--      Client code only ever reads its own row (.eq('id', user.id)), so
--      scoping read to owner-or-staff is a safe restriction.
--   2. wardrobe_items and saved_outfits each carried a leftover
--      "all access for authenticated users" policy alongside a stricter
--      owner-or-admin policy. RLS policies are OR-ed, so the broad policy
--      made the strict one meaningless -- any signed-in user could read/
--      write any other user's wardrobe items and saved outfits.
--   3. user_measurements had two near-duplicate policies per operation
--      (leftover from earlier migrations). Consolidated to one per command
--      for auditability; behavior is unchanged (owner-or-admin).

-- 1. profiles: replace public read with owner-or-staff read
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
CREATE POLICY "Enable read for own profile or admin"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR is_staff_or_admin());

-- 2. wardrobe_items: drop the overly-broad policy, keep owner-or-admin
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.wardrobe_items;

-- 3. saved_outfits: drop the overly-broad policy, keep owner-or-admin
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.saved_outfits;

-- 4. user_measurements: consolidate duplicate policies into one per command
DROP POLICY IF EXISTS "Users can insert own measurements" ON public.user_measurements;
DROP POLICY IF EXISTS "Users can insert their own measurements" ON public.user_measurements;
DROP POLICY IF EXISTS "Users can update own measurements" ON public.user_measurements;
DROP POLICY IF EXISTS "Users can update their own measurements" ON public.user_measurements;
DROP POLICY IF EXISTS "Users can view own measurements" ON public.user_measurements;
DROP POLICY IF EXISTS "Users can view their own measurements" ON public.user_measurements;
-- "Enable select/insert/update-delete for own measurements or admin" policies
-- already cover owner-or-admin for all commands; nothing further to create.
