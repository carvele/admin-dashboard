-- Not reversible: the original image_url was already destroyed before this
-- migration ran. This restores the corrupted sentinel value for symmetry
-- only, not a real recovery.
UPDATE public.products
SET image_url = '👗'
WHERE id = 'b0000005-0000-4000-8000-000000000001' AND image_url IS NULL;
