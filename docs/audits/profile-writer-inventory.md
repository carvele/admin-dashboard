# Cross-Repo Profile Writer Inventory & Live Privilege Surface Audit (B2A-2a)

**Audit Date:** 2026-09-07  
**Scope:** `admin-dashboard` (C:/Users/carlv/admin-dashboard), `jezsy-mobile-app` (C:/Users/carlv/jezsy-mobile-app), Edge Functions, Migration SQL, Live PostgreSQL Catalog & RLS Surface (`public.profiles`)  
**Phase:** B2A-2a (Read-Only Inventory & Ground-Truth Correlation)  
**Status:** **FINAL AUDIT REPORT** (Approved & Synchronized with Frozen B2A-2 Specifications)

---

## 1. Executive Summary

This inventory audits every write path to `public.profiles` across the client applications, serverless Edge Functions, database RPCs, and PostgreSQL triggers. It correlates static repository code against the **live database catalog**, recording both the application code paths and the actual database authorities granted by PostgreSQL and Row-Level Security (RLS).

### Core Questions Answered:
1. **Who currently writes each `profiles` field?**  
   Identified and categorized into distinct writer sinks spanning client UIs, service wrappers, Edge Functions, RPCs, and database triggers.
2. **What database authority currently allows that write, and should that authority still exist?**  
   The live database grants broad table-level `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` permissions to the `authenticated` and `anon` roles. While PostgreSQL reuses the `USING` predicate `((SELECT auth.uid() AS uid) = id)` as an implicit `WITH CHECK` on the policy `Enable update for users based on email` (preventing users from reassigning rows away from themselves), that policy constrains only row identity, not which columns may change. Consequently, an authenticated client retains database authority to submit updates targeting `role`, `employment_status`, `is_blocked`, or `deleted` on their own row, leaving the `check_profile_updates` trigger as the sole enforcement barrier preventing privilege escalation. In B2A-3, direct table mutation authority for privileged columns must be revoked or restricted, unnecessary privileges outside the intended RLS-protected client mutation surface (`TRUNCATE`, `REFERENCES`, `TRIGGER`) must be stripped, and privileged mutations must be isolated behind strict RPC-only boundaries.

---

## 2. Live Database Catalog & RLS Surface

### 2.1 Table Properties & Privileges
- **Table:** `public.profiles`
- **Row-Level Security:** `relrowsecurity = true`, `relforcerowsecurity = false`
- **Column Privileges:** No column-level `attacl` definitions. All columns inherit table grants.

| Grantee | Privilege Type | Is Grantable | Database Authority Risk / Notes |
|---|---|---|---|
| `anon` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | NO | **Scope for B2A-3 Revocation:** Unnecessary privileges outside the intended RLS-protected client mutation surface (`TRUNCATE` and `REFERENCES` are whole-table operations outside RLS; `TRIGGER` is a table DDL privilege outside the row-security model). |
| `authenticated` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | NO | **Scope for B2A-3 Revocation:** `TRUNCATE`, `REFERENCES`, and `TRIGGER` represent unnecessary authority outside RLS. These table grants must be revoked, and `UPDATE` authority restricted away from privileged columns. |
| `service_role` | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | NO | Full administrative bypass for Edge Functions and background workers. |
| `postgres` | ALL PRIVILEGES | YES | Database owner superuser. |

> [!IMPORTANT]
> **Non-RLS Grants in Scope for B2A-3:** PostgreSQL explicitly states that whole-table operations such as `TRUNCATE` and `REFERENCES` are not protected by Row-Level Security, and `TRIGGER` is a table-level DDL privilege outside the row-policy model. While the Supabase REST API does not directly expose a "truncate table" endpoint, leaving `TRUNCATE`, `REFERENCES`, and `TRIGGER` granted to `anon` and `authenticated` represents unnecessary privilege outside the intended RLS-protected client mutation surface that B2A-3 should revoke.

### 2.2 Live Row-Level Security (RLS) Policies
Inspected from `pg_policies` on `public.profiles`:

| Policy Name | Permissive | Roles | Command | USING (`qual`) | WITH CHECK (`with_check`) | Analysis |
|---|---|---|---|---|---|---|
| `Enable all access for admin/staff` | PERMISSIVE | `{authenticated}` | `ALL` | `is_staff_or_admin()` | `is_staff_or_admin()` | Grants staff and admins full SELECT, INSERT, UPDATE, DELETE over all rows. Relies on client-side discipline or triggers to avoid accidental clobbering. |
| `Enable insert for authenticated users only` | PERMISSIVE | `{public}` | `INSERT` | *null* | `(( SELECT auth.uid() AS uid) = id)` | Permits authenticated users to insert their own profile row upon signup. |
| `Enable read for own profile or admin` | PERMISSIVE | `{public}` | `SELECT` | `((( SELECT auth.uid() AS uid) = id) OR is_staff_or_admin())` | *null* | Read access for self and active staff/admin. |
| `Enable update for users based on email` | PERMISSIVE | `{public}` | `UPDATE` | `(( SELECT auth.uid() AS uid) = id)` | *null* (re-uses `USING`) | **ROW-CONSTRAINED BUT COLUMN-UNCONSTRAINED:** Under PostgreSQL rules, when an UPDATE policy omits `WITH CHECK`, the `USING` clause is re-evaluated as `WITH CHECK`. This prevents row-stealing, but only constrains *which row* is updated, not *which columns* are modified. An authenticated client retains database authority to send updates to `role`, `employment_status`, `is_blocked`, or `deleted` on their own row, relying entirely on `check_profile_updates()` to block the mutation. |

### 2.3 Live Triggers on `profiles` & Auth

| Trigger Name | Relation | Timing / Event | Function Name | Execution Mode & Owner | Summary of Logic & Column Access | Repo Provenance |
|---|---|---|---|---|---|---|
| `on_auth_user_created` | `auth.users` | `AFTER INSERT FOR EACH ROW` | `handle_new_user()` | `SECURITY DEFINER` (postgres) | Inserts row into `public.profiles (id, email, role, created_at, updated_at)` with default `'customer'`. `ON CONFLICT (id) DO NOTHING`. Note: there is currently NO matching trigger on `auth.users UPDATE` to synchronize email changes. | `LIVE/UNVERSIONED` (Bootstrap trigger; only altered in migrations) |
| `check_profile_updates_trigger` | `public.profiles` | `BEFORE UPDATE FOR EACH ROW` | `check_profile_updates()` | `SECURITY DEFINER` (postgres) | **Privilege Guard:** If `NEW.role`, `employment_status`, `is_blocked`, or `deleted` change: requires `auth.uid()` to be an admin/owner, prevents self-modification, prevents owner modification/creation. | `VERSIONED IN REPO` (`jezsy-mobile-app/supabase/migrations/20260812224902_*.sql:8`) |
| `log_staff_status_change_trigger` | `public.profiles` | `AFTER UPDATE FOR EACH ROW` | `log_staff_status_change()` | `SECURITY DEFINER` (postgres) | **Audit Logger:** When `employment_status` or `is_blocked` changes, writes record to `public.staff_status_history` capturing `app.current_change_note`. Does NOT log `deleted` changes. | `LIVE/UNVERSIONED` (Altered/revoked in migrations, but `CREATE FUNCTION` uncommitted) |
| `trg_sync_profile_full_name` | `public.profiles` | `BEFORE INSERT OR UPDATE OF first_name, last_name FOR EACH ROW` | `sync_profile_full_name()` | `SECURITY INVOKER` (postgres) | **Derived Field:** Sets `NEW.full_name := NULLIF(TRIM(CONCAT(NEW.first_name, ' ', NEW.last_name)), '')`. | `LIVE/UNVERSIONED` (No migration file found in either repo; Phase-C catalog item) |
| `trg_touch_updated_at` | `public.profiles` | `BEFORE UPDATE FOR EACH ROW` | `touch_updated_at()` | `SECURITY INVOKER` (postgres) | **Timestamp Maintenance:** Sets `NEW.updated_at := now()`. | `VERSIONED IN REPO` (`jezsy-mobile-app/supabase/migrations/20260720250000_*.sql:16`) |

---

## 3. Profile Writers Master Inventory

The following table documents every writer sink, its upstream caller paths, written columns, authorization guards, and architectural target treatment.

| Repo / File / Lines | Writer Sink / Caller Path | Operation | Columns Written | Runtime Identity | Authorization Guard | Privileged Fields | Current Boundary | Backend Ownership | Cross-Repo Impact | Target Treatment | Finding Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `admin-dashboard/src/pages/admin/StaffManagement.jsx:212-214` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `StaffManagement.jsx:confirmRemove` | `UPDATE` | `deleted`, `updated_at` | `authenticated` (Admin JWT) | RLS `Enable all access for admin/staff` + `check_profile_updates` | `deleted` | Direct Client UI | N/A (Client code) | Admin | `NOT JUSTIFIED DIRECT` → Move behind frozen RPC `set_staff_archive_state(..., true, note)` | `CONFIRMED` |
| `admin-dashboard/src/pages/admin/StaffManagement.jsx:267-270` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `StaffManagement.jsx:handleReactivate` | `UPDATE` | `deleted`, `updated_at` | `authenticated` (Admin JWT) | RLS `Enable all access for admin/staff` + `check_profile_updates` | `deleted` | Direct Client UI | N/A (Client code) | Admin | `NOT JUSTIFIED DIRECT` → Move behind frozen RPC `set_staff_archive_state(..., false, note)` | `CONFIRMED` |
| `admin-dashboard/src/pages/admin/StaffManagement.jsx:190-193` | **Sink:** `supabase.rpc('update_staff_role', ...)` <br>**Caller:** `StaffManagement.jsx:confirmRoleToggle` (line 187 computes `newRole = member.role === 'owner' ? 'staff' : 'owner'`) | `RPC` (`UPDATE`) | `role`, `updated_at` | `authenticated` (Admin JWT) | RPC internal checks (`is_admin_or_owner()`, target checks) | `role` | Stored Procedure RPC | `VERSIONED IN REPO` (`jezsy-mobile-app/.../20260813154046_audit_log_hardening.sql`) | Admin | `Controlled RPC` → Replace with frozen specification `update_staff_role_v2`. Fix UI line 187 which attempts invalid role toggle to `'owner'`. | `CONFIRMED` |
| `admin-dashboard/src/services/staffService.js:105-110` | **Sink:** `supabase.rpc('update_staff_status', ...)` <br>**Callers:** `StaffManagement.jsx:handleReactivate:263`, `StaffProfile.jsx:requestStatusChange` | `RPC` (`UPDATE`) | `employment_status`, `is_blocked`, `updated_at` | `authenticated` (Admin JWT) | RPC internal checks (`is_admin_or_owner()`, note required, last-admin lockout) | `employment_status`, `is_blocked` | Stored Procedure RPC | `LIVE/UNVERSIONED` (Revoked/altered in migrations; original DDL uncommitted) | Admin | `Controlled RPC` → Replace with frozen specification `update_staff_status_v2` | `CONFIRMED` |
| `admin-dashboard/src/services/staffService.js:80-82` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `StaffProfile.jsx:handleSavePersonalInfo:217` → `updateStaffProfile` | `UPDATE` | `first_name`, `last_name`, `phone`, `gender`, `date_of_birth`, `address_line`, `city`, `province`, `zip_code`, `barangay`, `updated_at` | `authenticated` (Admin JWT) | RLS `Enable all access for admin/staff` | None (Filtered by `allowedFields`) | Service Wrapper (`staffService.js`) | N/A (Client code) | Admin | `JUSTIFIED DIRECT` → Retain Service + strict RLS for non-privileged staff info | `CONFIRMED` |
| `admin-dashboard/src/lib/supabaseService.js:143` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `Customers.jsx:handleEditSave:376` → `customerService.updateCustomer` → `updateDocument` | `UPDATE` | `first_name`, `last_name`, `email`, `phone`, `is_blocked`, `updated_at` | `authenticated` (Admin/Staff JWT) | RLS `Enable all access for admin/staff` + `check_profile_updates` | `is_blocked` | Generic CRUD Helper | N/A (Client code) | Admin | `NOT JUSTIFIED DIRECT` for `is_blocked` (must move to admin RPC) and `email` (system-managed). Personal info `JUSTIFIED DIRECT` via service. | `CONFIRMED` |
| `admin-dashboard/src/lib/supabaseService.js:174-177` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `Customers.jsx:handleDelete:416` → `customerService.deleteCustomer` → `softDeleteDocument` | `UPDATE` (Soft Delete) | `deleted`, `deleted_at` *(column missing on profiles)*, `updated_at` | `authenticated` (Admin/Staff JWT) | RLS `Enable all access for admin/staff` + `check_profile_updates` | `deleted` | Generic CRUD Helper | N/A (Client code) | Admin | `NOT JUSTIFIED DIRECT` → Move behind admin customer archive/delete RPC | `CONFIRMED` |
| `admin-dashboard/src/lib/supabaseService.js:128` | **Sink:** `supabase.from('profiles').insert(...)` <br>**Caller:** `customerService.createCustomer` (Dead code: no active UI caller) | `INSERT` | `customerData` spread, `role: 'customer'`, `deleted: false` | `authenticated` (Admin/Staff JWT) | RLS `Enable all access for admin/staff` | `role`, `deleted` | Generic CRUD Helper | N/A (Client code) | Admin | `NO CLIENT WRITE REQUIRED` → Deprecate/remove dead client insert path | `CONFIRMED` |
| `admin-dashboard/supabase/functions/activate-staff-account/index.ts:110-111` | **Sink:** `adminClient.from('profiles').upsert(...)` <br>**Caller:** `SetPassword.jsx:65` → Edge Function `activate-staff-account` | `UPSERT` | `id`, `email`, `role`, `deleted: false`, `is_blocked: false`, `employment_status: 'active'`, `updated_at` | `service_role` | Edge Function validates caller JWT & GoTrue `app_metadata.staff_role` | `role`, `deleted`, `is_blocked`, `employment_status` | Edge Function (Service Role) | `VERSIONED IN REPO` (`admin-dashboard/supabase/functions/...`) | Admin | `Controlled Edge Function` → Retain service-role activation boundary | `CONFIRMED` |
| `jezsy-mobile-app/supabase/functions/process-account-deletion/index.ts:109` | **Sink:** `callerClient.rpc('process_account_deletion', ...)` <br>**Caller:** `AccountDeletionRequests.jsx:71` → `processAccountDeletion` → Edge Function → RPC | `RPC` (`UPDATE`) | `first_name`, `last_name`, `email`, `phone`, `address_line`, `barangay`, `city`, `province`, `zip_code`, `date_of_birth`, `gender`, `employment_status`, `fit_preference`, `expo_push_token` set to NULL; `deleted = true`, `updated_at` | `SECURITY DEFINER` (Called with Staff JWT) | RPC `is_staff_or_admin()` check + Rate Limiting + Edge Function | `employment_status`, `deleted` | Edge Function + RPC | `VERSIONED IN REPO` (`jezsy-mobile-app/.../20260904190500_secure_account_deletion.sql`) | Shared (Admin processes mobile customer deletion) | `Controlled RPC` → Retain Edge Function + RPC pipeline | `CONFIRMED` |
| `jezsy-mobile-app/app/(auth)/profile-setup.tsx:224-241` | **Sink:** `supabase.from('profiles').upsert(...)` <br>**Caller:** `profile-setup.tsx:handleSubmit` | `UPSERT` | `id`, `email`, `first_name`, `username`, `last_name`, `phone`, `gender`, `date_of_birth`, `address_line`, `barangay`, `city`, `province`, `zip_code`, `updated_at` | `authenticated` (Customer JWT) | RLS `Enable insert/update for users` (`auth.uid() = id`) | None | Direct Client UI | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Route personal info via `profileService.ts` abstraction + strict RLS. `id = auth.uid()` permitted for initial upsert fallback only. | `CONFIRMED` |
| `jezsy-mobile-app/app/profile/edit.tsx:131-148` | **Sink:** `supabase.from('profiles').upsert(...)` <br>**Caller:** `edit.tsx:handleSave` | `UPSERT` | `id`, `email`, `first_name`, `username`, `last_name`, `phone`, `gender`, `date_of_birth`, `address_line`, `barangay`, `city`, `province`, `zip_code`, `updated_at` | `authenticated` (Customer JWT) | RLS `Enable update for users based on email` (`auth.uid() = id`) | None | Direct Client UI | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Route via `profileService.ts` abstraction + strict RLS. `email` and `id` should not be client-updated. | `CONFIRMED` |
| `jezsy-mobile-app/src/context/AuthContext.tsx:164-177` | **Sink:** `supabase.from('profiles').upsert(...)` <br>**Caller:** `AuthContext.tsx:syncProfile` | `UPSERT` | `id`, `email`, `first_name`, `last_name`, `updated_at` | `authenticated` (Customer JWT) | RLS `Enable insert/update for users` (`auth.uid() = id`) | None | Service Context | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Retain OAuth name seeding via service + strict RLS | `CONFIRMED` |
| `jezsy-mobile-app/app/profile/measurements.tsx:253` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `measurements.tsx:handleSave` | `UPDATE` | `fit_preference` | `authenticated` (Customer JWT) | RLS `Enable update for users based on email` (`auth.uid() = id`) | None | Direct Client UI | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Route via `profileService.ts` + strict RLS | `CONFIRMED` |
| `jezsy-mobile-app/src/services/profileService.ts:6-8` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `privacy-settings.tsx:handleToggle:61` → `updatePrivacySettings` | `UPDATE` | `is_wardrobe_shared` | `authenticated` (Customer JWT) | RLS `Enable update for users based on email` (`auth.uid() = id`) | None | Service Wrapper (`profileService.ts`) | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Retain Service + strict RLS | `CONFIRMED` |
| `jezsy-mobile-app/src/services/profileService.ts:14-16` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `privacy-settings.tsx:handlePrivacyChange:91` → `updateProfile` | `UPDATE` | `wardrobe_privacy` OR `wishlist_privacy` | `authenticated` (Customer JWT) | RLS `Enable update for users based on email` (`auth.uid() = id`) | None | Service Wrapper (`profileService.ts`) | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Retain Service + strict RLS | `CONFIRMED` |
| `jezsy-mobile-app/src/utils/pushNotifications.ts:126-128` | **Sink:** `supabase.from('profiles').update(...)` <br>**Callers:** `AuthContext.tsx:151, 201`, `notifications-settings.tsx:67` → `savePushTokenToProfile` | `UPDATE` | `expo_push_token` | `authenticated` (Customer JWT) | RLS `Enable update for users based on email` (`auth.uid() = id`) | None | Utility Service | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Retain Service + strict RLS | `CONFIRMED` |
| `jezsy-mobile-app/src/services/profileService.ts:30-32` | **Sink:** `supabase.from('profiles').update(...)` <br>**Caller:** `notifications-settings.tsx:handleToggle:73` → `deletePushToken` | `UPDATE` | `expo_push_token` (set to `null`) | `authenticated` (Customer JWT) | RLS `Enable update for users based on email` (`auth.uid() = id`) | None | Service Wrapper (`profileService.ts`) | N/A (Client code) | Mobile | `JUSTIFIED DIRECT` → Retain Service + strict RLS | `CONFIRMED` |
| *Database Trigger* (`auth.users`) | **Sink:** `handle_new_user()` <br>**Caller:** `AFTER INSERT ON auth.users` | `INSERT` | `id`, `email`, `role: 'customer'`, `created_at`, `updated_at` | `DB trigger` (`SECURITY DEFINER`) | Postgres Trigger Engine | `role` | Database Trigger | `LIVE/UNVERSIONED` | Shared | `Retain DB Trigger` | `CONFIRMED` |
| *Database Trigger* (`public.profiles`) | **Sink:** `sync_profile_full_name()` <br>**Caller:** `BEFORE INSERT OR UPDATE OF first_name, last_name` | `TRIGGER ASSIGNMENT` | `full_name` | `DB trigger` (`SECURITY INVOKER`) | Postgres Trigger Engine | None | Database Trigger | `LIVE/UNVERSIONED` | Shared | `Retain DB Trigger` (Phase-C item) | `CONFIRMED` |
| *Database Trigger* (`public.profiles`) | **Sink:** `touch_updated_at()` <br>**Caller:** `BEFORE UPDATE ON profiles` | `TRIGGER ASSIGNMENT` | `updated_at` | `DB trigger` (`SECURITY INVOKER`) | Postgres Trigger Engine | None | Database Trigger | `VERSIONED IN REPO` (`jezsy-mobile-app/.../20260720250000_*.sql`) | Shared | `Retain DB Trigger` | `CONFIRMED` |

---

## 4. Decision Buckets & Field-Classification Guidance for B2A-3

```
CURRENTLY DIRECT
      ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. ARCHITECTURALLY JUSTIFIED direct-client authority         │
│    (client → application service → Supabase table → strict RLS)│
└─────────────────────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. NOT JUSTIFIED DIRECT                                     │
│    (client → service → RPC / Edge Function → controlled write) │
└─────────────────────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. NO CLIENT WRITE REQUIRED                                 │
│    (revoke mutation authority; read-only or auth-trigger only)│
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Field-Classification Analysis
To safely design B2A-3 column grants and RLS policies, each column on `public.profiles` is classified into its target mutation model:

| Column Name | Data Type | Current Client Writers | Target Classification | Architectural Rationale |
|---|---|---|---|---|
| `first_name`, `last_name` | text | Admin staff editor, Mobile profile setup/edit, AuthContext | `JUSTIFIED DIRECT` | Personal identification data; safe for authenticated user or staff to mutate via service layer with RLS. Triggers `sync_profile_full_name()`. |
| `username` | text | Mobile profile setup, Mobile edit | `JUSTIFIED DIRECT` | Customer handle; unique constraint enforced at database level. Service-mediated. |
| `phone`, `gender`, `date_of_birth` | text / date | Admin staff editor, Mobile profile setup/edit | `JUSTIFIED DIRECT` | Personal user details; safe for authenticated user or staff to mutate via service layer with RLS. |
| `address_line`, `city`, `province`, `zip_code`, `barangay` | text | Admin staff editor, Mobile profile setup/edit | `JUSTIFIED DIRECT` | Physical delivery address details; service-mediated client write with RLS. |
| `fit_preference` | text | Mobile measurements screen | `JUSTIFIED DIRECT` | Customer sizing preference; safe for authenticated owner to update. |
| `is_wardrobe_shared`, `wardrobe_privacy`, `wishlist_privacy`, `outfit_privacy`, `profile_visibility` | boolean / text | Mobile privacy settings | `JUSTIFIED DIRECT` | User consent and sharing preferences; safe for authenticated owner to update. |
| `expo_push_token` | text | Mobile notifications settings, push registration utility | `JUSTIFIED DIRECT` | Device push delivery token; safe for authenticated owner to update. |
| `id` | uuid | Mobile profile setup, Mobile edit, AuthContext | `NO CLIENT UPDATE REQUIRED` | Primary key. `UPDATE(id)` must NEVER be permitted. Permit client `INSERT(id)` with `WITH CHECK (id = auth.uid())` only if client-side onboarding upsert fallback is deliberately retained; otherwise managed by auth trigger. |
| `email` | text | Admin customer edit, Mobile profile setup/edit, AuthContext | `SYSTEM-MANAGED` | Direct `profiles.email` editing is **NOT justified**; authoritative source is Supabase Auth / GoTrue (`auth.users.email`). Note: live database catalog inspection confirms there is currently only an `AFTER INSERT ON auth.users` trigger (`handle_new_user`), with **NO `AFTER UPDATE ON auth.users` trigger synchronizing changed Auth emails back to `profiles.email`**. **B2A-3 prerequisite:** define or confirm the post-verification synchronization path from `auth.users.email` → `public.profiles.email` before client column UPDATE privileges are revoked. |
| `updated_at` | timestamptz | Admin staff/customer editors, Mobile setup/edit | `TRIGGER-MANAGED / CO-DEPENDENT CLEANUP` | Automatically maintained by `trg_touch_updated_at`. Many client writers currently submit `updated_at`. B2A-3 must first strip `updated_at` from client payloads or coordinate grant changes so client writes do not break if `UPDATE(updated_at)` is restricted. |
| `role` | text | Admin StaffManagement (`update_staff_role` RPC), activate-staff Edge Function | `NOT JUSTIFIED DIRECT` | Privileged role (`customer`, `staff`, `admin`, `owner`). Must be strictly revoked from client `UPDATE`/`INSERT`. Managed exclusively via `update_staff_role_v2` RPC and `activate-staff-account` Edge Function. |
| `employment_status`, `is_blocked` | text / boolean | Admin StaffManagement (`update_staff_status` RPC), Admin customer edit (`Customers.jsx:376`) | `NOT JUSTIFIED DIRECT` | Privileged staff status and customer suspension flags. Direct client UPDATE must be revoked. Staff status managed by `update_staff_status_v2` RPC; customer block managed by dedicated admin RPC. |
| `deleted` | boolean | Admin StaffManagement (`confirmRemove`/`handleReactivate`), Admin customer delete (`Customers.jsx:416`) | `NOT JUSTIFIED DIRECT` | Soft-delete flag. Direct client UPDATE must be revoked. Staff archival managed by `set_staff_archive_state` RPC; customer deletion managed by account deletion RPC. |
| `created_at`, `full_name` | timestamptz / text | None (DB triggers/defaults) | `NO CLIENT WRITE REQUIRED` | System default and trigger-computed column (`sync_profile_full_name`). Read-only to clients. |

---

### 4.2 Audit-Contract Alignment with Frozen B2A-2 Design

1. **Staff Role Modification (`update_staff_role_v2`):**
   - **Sink:** SECURITY DEFINER RPC.
   - **Audit Contract:** Writes application audit entry to `public.logs` matching live schema:
     ```text
     user_id     ← caller UUID (auth.uid())
     user_name   ← actor display name (COALESCE(first_name || ' ' || last_name, 'Staff'))
     action      ← 'Changed staff role'
     target_type ← 'staff'
     target_id   ← target_user_id::text
     details     ← jsonb_build_object('previous_role', target_role, 'new_role', new_role)
     ```
   - **Concurrency / Invariant Protection:** Target row-lock (`SELECT ... FOR UPDATE`), shared advisory lock `PERFORM pg_advisory_xact_lock(7421, 1);` when prospective role change would shrink privileged pool (`admin` → `staff`), last-active-privileged re-check, structured return JSON.
   - **Current UI Defect:** `admin-dashboard/src/pages/admin/StaffManagement.jsx:187` computes:
     ```javascript
     const newRole = member.role === 'owner' ? 'staff' : 'owner';
     ```
     When run on a staff member (`member.role === 'staff'`), it passes `newRole = 'owner'` to `update_staff_role`. This call is rejected at runtime by `update_staff_role`'s guard (`IF new_role NOT IN ('staff', 'admin') THEN RAISE EXCEPTION 'Role must be "staff" or "admin"';`), rendering the UI toggle broken for staff promotions. B2A-3 must align the UI to toggle between `'staff'` and `'admin'`.
2. **Staff Status & Block Modification (`update_staff_status_v2`):**
   - **Sink:** SECURITY DEFINER RPC.
   - **Audit Contract:** Status and block changes use the existing `staff_status_history` trigger, passing the mandatory non-empty note via session transaction setting `app.current_change_note`.
   - **Concurrency / Invariant Protection:** Target row-lock (`SELECT ... FOR UPDATE`), prospective privileged-account check, shared advisory lock `PERFORM pg_advisory_xact_lock(7421, 1);` if prospective state leaves active pool, last-active-privileged re-check, structured return JSON.
3. **Staff Archival & Reactivation (`set_staff_archive_state`):**
   - **Sink:** SECURITY DEFINER RPC.
   - **Audit Contract:** Archive and reactivation events write to `public.logs` matching live schema:
     ```text
     user_id     ← caller UUID (auth.uid())
     user_name   ← actor display name
     action      ← CASE WHEN archived THEN 'Archived staff member' ELSE 'Reactivated staff account' END
     target_type ← 'staff'
     target_id   ← target_user_id::text
     details     ← jsonb_build_object('archived', archived, 'previous_deleted', current_deleted, 'new_deleted', archived, 'note', trim(change_note))
     ```
     They do **not** log to `staff_status_history` (`deleted` flag changes are account lifecycle events, not employment-status changes).
   - **Concurrency / Invariant Protection:** Target row-lock (`SELECT ... FOR UPDATE`), shared advisory lock `PERFORM pg_advisory_xact_lock(7421, 1);` if archiving an admin, last-active-privileged re-check, structured return JSON. Replaces direct client writes at `StaffManagement.jsx:212` and `:267`.

---

## 5. Architectural Findings & Migration Ledger Scope for B2A-3

1. **Broad Table Grants vs. Narrow Privilege Surface:**  
   PostgreSQL grants `ALL` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) on `profiles` to `anon` and `authenticated`.
   - Table privileges outside the intended RLS mutation surface: `TRUNCATE` and `REFERENCES` are whole-table operations not protected by RLS, and `TRIGGER` is a table DDL privilege outside the row-policy model. B2A-3 should revoke these unnecessary privileges: `REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM anon, authenticated;`.
   - Row-level `UPDATE` authority must be restricted so authenticated users cannot touch privileged columns (`role`, `employment_status`, `is_blocked`, `deleted`).
2. **Narrowed Migration Scope for B2A-3:**  
   The audit identified several live functions that are `LIVE/UNVERSIONED` in the database catalog (`update_staff_status`, `sync_profile_full_name`, `log_staff_status_change`, `handle_new_user`).  
   **B2A-3 must NOT attempt to backfill unrelated live functions** into `admin-dashboard`. B2A-3's migration scope is strictly narrowed to:
   - Defining the three frozen `_v2` RPCs: `update_staff_role_v2`, `update_staff_status_v2`, `set_staff_archive_state`.
   - Defining the authorization helper function `public.can_manage_staff()`.
   - Providing backwards-compatibility wrappers for legacy `update_staff_status` and `update_staff_role` signatures until client callers are migrated.
   - Revoking unneeded table-level privileges (`TRUNCATE`, `REFERENCES`, `TRIGGER`) and hardening column/RLS write authority on `profiles`.
   - Managing directly affected audit dependencies (e.g. `log_staff_status_change` interaction via `app.current_change_note`).  
   Unrelated functions like `sync_profile_full_name()` and auth bootstrap triggers remain documented as Phase-C schema-ownership alignment items to prevent cross-repo migration entanglement.
3. **Missing Columns & Client Data Contracts:**  
   - `customerService.js:deleteCustomer` calls `softDeleteDocument('profiles', docId)`, attempting to write non-existent column `deleted_at`.
   - Client writers explicitly send `updated_at` despite the presence of `trg_touch_updated_at`. B2A-3 client remediation must clean up redundant payload fields.

---

## 6. Verification Status

| Check | Result | Evidence |
|---|---|---|
| Admin Dashboard Repo Scan | ✅ Complete | Grep & AST trace across `src/` and `supabase/functions/` |
| Mobile App Repo Scan | ✅ Complete | Grep & AST trace across `app/`, `src/`, and `supabase/` |
| Live PostgreSQL Grants Query | ✅ Complete | `information_schema.table_privileges` via live Supabase connection |
| Live RLS Policies Query | ✅ Complete | `pg_policies` catalog query on `public.profiles` |
| Live Trigger Inspection | ✅ Complete | `pg_trigger` + `pg_proc` definition extraction |
| Candidate Functions Inventory | ✅ Complete | Catalog query for functions referencing `profiles` |
| Cross-Repo Provenance Match | ✅ Complete | Cross-checked with migration histories in both repositories |
| Contract Harmonization Applied | ✅ Complete | Advisory lock standardized to `(7421, 1)`, audit schema mapped to `public.logs`, email sync dependency documented, non-RLS grant wording clarified |

**B2A-2a Status:** **APPROVED & FINAL**. Ready to open B2A-3 design and implementation planning.
