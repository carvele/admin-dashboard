-- =============================================================================
-- Phase B2A-3: Post-Deployment Catalog Verification Script
-- Execute this query immediately after applying 20260907082717_harden_staff_rbac.sql
-- =============================================================================

-- 1. Verify Functions: Existence, Security Mode, and Search Path
SELECT 
  p.proname,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_mode,
  array_to_string(p.proconfig, ', ') AS proconfig,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_device_approved',
    'can_manage_staff',
    'update_staff_status_v2',
    'update_staff_role_v2',
    'set_staff_archive_state',
    'update_staff_role',
    'update_staff_status',
    'handle_user_email_change'
  )
ORDER BY p.proname;

-- 2. Verify Table-Level Privileges on public.profiles (Must NOT have broad UPDATE/INSERT/DELETE)
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- 3. Verify Column-Level UPDATE Grants on public.profiles for authenticated
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee = 'authenticated'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;

-- 4. Verify Column-Level INSERT Grants on public.profiles for authenticated
SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND grantee = 'authenticated'
  AND privilege_type = 'INSERT'
ORDER BY column_name;

-- 5. Verify Restrictive INSERT Policy on public.profiles
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'profiles'
  AND policyname = 'restrict_profile_insert_to_own_auth';

-- 6. Verify Auth Email Synchronization Trigger on auth.users
SELECT 
  event_object_schema AS schema,
  event_object_table AS table,
  trigger_name,
  event_manipulation AS event,
  action_timing AS timing,
  action_statement AS statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
  AND trigger_name = 'on_auth_user_email_changed';

-- 7. Verify Function Execution Permissions
SELECT 
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_device_approved',
    'can_manage_staff',
    'update_staff_status_v2',
    'update_staff_role_v2',
    'set_staff_archive_state',
    'update_staff_role',
    'update_staff_status',
    'handle_user_email_change'
  )
ORDER BY p.proname;
