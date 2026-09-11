-- ProductForm.jsx's save handler fell back to the literal emoji '👗' as
-- imageUrl whenever finalImages was empty on save -- including on an edit
-- to a product whose real image predates the `images` array field and so
-- has an empty array despite a real image_url. That corrupted this row's
-- image_url to a non-URL string, breaking every image render in both apps.
-- The original URL is not recoverable; null is the correct "no image" state,
-- already handled gracefully everywhere the mobile app renders a product
-- card. See the sibling code fix in ProductForm.jsx/validation.js in this
-- same PR for the root cause.
UPDATE public.products
SET image_url = NULL
WHERE id = 'b0000005-0000-4000-8000-000000000001' AND image_url = '👗';
