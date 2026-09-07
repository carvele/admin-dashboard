-- Rollback: Remove public.min(uuid) aggregate and function

DROP AGGREGATE IF EXISTS public.min(uuid);
DROP FUNCTION IF EXISTS public.min_uuid_step(uuid, uuid);
