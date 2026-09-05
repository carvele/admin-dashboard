-- auto_cancel_expired_reservations() is SECURITY DEFINER and is only ever
-- meant to be invoked by its own pg_cron schedule (auto_cancel_reservations_5m),
-- which runs as the job owner and is unaffected by this revoke. Confirmed via
-- has_function_privilege that anon/authenticated could call it directly over
-- PostgREST -- the project's known PUBLIC-default-grant gap.
REVOKE EXECUTE ON FUNCTION public.auto_cancel_expired_reservations() FROM PUBLIC, anon, authenticated;
