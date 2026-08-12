-- Migration: Enforce product visibility and soft-deletion in RLS SELECT policy
-- Ensures non-staff/anonymous users can only query visible, non-deleted products

DO $$
BEGIN
  -- Drop existing public read policy if present to avoid conflicts
  DROP POLICY IF EXISTS "Public can only read visible active products" ON public.products;
  DROP POLICY IF EXISTS "Allow public read access for active products" ON public.products;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Public can only read visible active products" ON public.products
  FOR SELECT
  USING (
    (deleted = false AND visibility = 'public')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'admin', 'owner')
        AND deleted IS DISTINCT FROM true
    )
  );
