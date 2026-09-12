-- Rollback for 20260912041530_fix_device_rpc_grants_and_drop_old_overload.sql
-- Not meaningfully reversible (the old 3-arg overload's body is gone from
-- history too, since it was never migrated in the first place). Re-grants
-- EXECUTE to anon if you truly need to revert, though doing so restores the
-- privilege-escalation gap this migration closed.
GRANT EXECUTE ON FUNCTION public.register_device(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_device(UUID, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_prune_devices(TIMESTAMP WITH TIME ZONE) TO anon;
