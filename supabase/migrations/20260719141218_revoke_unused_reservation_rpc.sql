REVOKE EXECUTE ON FUNCTION public.create_reservations_from_cart(jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_reservations_from_cart(jsonb, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_reservations_from_cart(jsonb, text, text, text) FROM authenticated;
