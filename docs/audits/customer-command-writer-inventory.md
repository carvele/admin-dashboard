# Cross-Repo Customer Command Writer Inventory & Live Privilege Surface Audit (B2A-4a)

**Audit Date:** 2026-09-07  
**Scope:** `admin-dashboard` (`c:/Users/carlv/admin-dashboard`), `jezsy-mobile-app` (`c:/Users/carlv/jezsy-mobile-app`), Edge Functions, Migration SQL, Live PostgreSQL Catalog & RLS Surface (`public.profiles`, `public.account_deletion_requests`, `public.logs`)  
**Phase:** B2A-4a (Customer Command Boundary Read-Only Inventory & Ground-Truth Correlation)  
**Status:** **AUDIT COMPLETE — PENDING USER REVIEW** (Zero Code Mutations Executed)

---

## 1. Executive Summary

Phase **B2A-3** successfully established a hardened command boundary for Staff and Role-Based Access Control (RBAC), eliminating client direct writes to `profiles.role`, `profiles.employment_status`, `profiles.id`, and `profiles.email`, while revoking unneeded table privileges (`TRUNCATE`, `REFERENCES`, `TRIGGER`). However, `UPDATE` authority on `profiles.is_blocked` and `profiles.deleted` was intentionally retained on a **transitional basis** for the `authenticated` PostgreSQL role to prevent breaking active customer administration features in the Admin Dashboard.

The core objective of **Phase B2A-4** is to close this remaining vulnerability surface:
1. Identify and audit every code path across Admin, Mobile, Edge Functions, and RPCs that modifies customer `is_blocked` or `deleted`.
2. Correlate those paths against the live PostgreSQL catalog, Row-Level Security (RLS) policies, column grants, triggers, and existing stored procedures.
3. Resolve the architectural question of whether `can_manage_staff()` should be reused or a dedicated `can_manage_customers()` capability predicate is warranted.
4. Establish the blueprint to route customer status and archival changes behind audited, hardened `SECURITY DEFINER` RPCs and **permanently revoke `UPDATE(is_blocked, deleted)` from `authenticated`**.

### Core Questions Answered in B2A-4a:
1. **Who currently writes customer `is_blocked` and `deleted`?**  
   - Direct writes originate exclusively from `admin-dashboard`: `Customers.jsx` modifies `is_blocked` via `customerService.updateCustomer()` (using `updateDocument`), and attempts to soft-delete via `customerService.deleteCustomer()` (using `softDeleteDocument`).
   - Serverless/RPC writes occur via `AccountDeletionRequests.jsx` invoking Edge Function `process-account-deletion`, which calls RPC `process_account_deletion(_request_id)`.
   - `jezsy-mobile-app` **never** writes directly to `profiles.is_blocked` or `profiles.deleted`. Mobile customer deletion is handled via `request_account_deletion` (writing to `account_deletion_requests`), and peer-to-peer social blocking is isolated to `public.connections` via `is_blocked_between()`.
2. **What database authority allows these writes today?**  
   - The transitional PostgreSQL column grant `GRANT UPDATE(is_blocked, deleted) ON public.profiles TO authenticated;`.
   - RLS policy `Enable all access for admin/staff` (`ALL` using `is_staff_or_admin()`).
3. **What critical defects exist in current customer mutations?**  
   - **Broken Customer Deletion:** `customerService.deleteCustomer()` invokes `softDeleteDocument('profiles', docId)`, which attempts to write to a non-existent `deleted_at` column. This fails at runtime in PostgREST with `PGRST204`, rendering customer deletion in the Admin UI completely non-functional.
   - **Role Mismatch in Customer Status Toggle:** The Admin UI allows any authenticated staff member on `/customers` to toggle status between Active and Inactive, but the live database trigger `check_profile_updates` rejects staff with an unhandled exception because only `admin` and `owner` roles are permitted.
   - **Trigger Conflict in Account Deletion:** RPC `process_account_deletion` authorizes any active staff member via `is_staff_or_admin()`, but its internal SQL statement `UPDATE public.profiles SET ... deleted = true` fires `check_profile_updates`, which fails if the actor is `staff`.
4. **Should `can_manage_staff()` be reused for customer operations?**  
   - **No.** Reusing `can_manage_staff()` creates domain coupling between internal HR/staff credential management and customer moderation. A dedicated `can_manage_customers()` capability must be introduced, enforcing active employment, unblocked status, approved device verification (with owner bypass), and appropriate role boundaries.

---

## 2. Live Database Catalog & Ground-Truth Surface

### 2.1 Table Properties & Column Privileges (`public.profiles`)
- **Table:** `public.profiles` (`relrowsecurity = true`, `relforcerowsecurity = false`)
- **Live Column Privileges for `authenticated`:**
  - **`SELECT`:** Granted on all columns.
  - **`INSERT`:** Granted on personal profile columns + transitional `id`, `email`. (Constrained by RESTRICTIVE RLS policy `restrict_profile_insert_to_own_auth`).
  - **`UPDATE`:**
    - Allowed personal fields: `first_name`, `last_name`, `phone`, `gender`, `date_of_birth`, `address_line`, `city`, `province`, `zip_code`, `barangay`, `username`, `fit_preference`, `expo_push_token`, `is_wardrobe_shared`, `wardrobe_privacy`, `wishlist_privacy`, `outfit_privacy`, `profile_visibility`, `updated_at`.
    - Privileged fields revoked in B2A-3: `role`, `employment_status`, `id`, `email`, `created_at`, `full_name`.
    - **Privileged fields transitionally retained (Scope of B2A-4):** `is_blocked`, `deleted`.

```
================================================================================
CURRENT COLUMN UPDATE PRIVILEGES ON public.profiles (ROLE: authenticated)
================================================================================
address_line         ✅ Allowed (Personal)
barangay             ✅ Allowed (Personal)
city                 ✅ Allowed (Personal)
date_of_birth        ✅ Allowed (Personal)
deleted              ⚠️ TRANSITIONAL (Privileged - Target for B2A-4 Revocation)
expo_push_token      ✅ Allowed (Personal)
first_name           ✅ Allowed (Personal)
fit_preference       ✅ Allowed (Personal)
gender               ✅ Allowed (Personal)
is_blocked           ⚠️ TRANSITIONAL (Privileged - Target for B2A-4 Revocation)
is_wardrobe_shared   ✅ Allowed (Personal)
last_name            ✅ Allowed (Personal)
outfit_privacy       ✅ Allowed (Personal)
phone                ✅ Allowed (Personal)
profile_visibility   ✅ Allowed (Personal)
province             ✅ Allowed (Personal)
updated_at           ✅ Allowed (Timestamp)
username             ✅ Allowed (Personal)
wardrobe_privacy     ✅ Allowed (Personal)
wishlist_privacy     ✅ Allowed (Personal)
zip_code             ✅ Allowed (Personal)
--------------------------------------------------------------------------------
role                 🛑 REVOKED in B2A-3
employment_status    🛑 REVOKED in B2A-3
id                   🛑 REVOKED in B2A-3
email                🛑 REVOKED in B2A-3
created_at           🛑 REVOKED in B2A-3
full_name            🛑 REVOKED in B2A-3
================================================================================
```

### 2.2 Live Row-Level Security (RLS) Policies on `public.profiles`
Verified directly from `pg_policies`:

| Policy Name | Permissive | Roles | Command | USING (`qual`) | WITH CHECK (`with_check`) | Analysis |
|---|---|---|---|---|---|---|
| `Enable all access for admin/staff` | PERMISSIVE | `{authenticated}` | `ALL` | `is_staff_or_admin()` | `is_staff_or_admin()` | Allows active staff and admins on approved devices to perform all DML operations across all rows. Relies on column grants and triggers to prevent accidental or malicious clobbering. |
| `Enable insert for authenticated users only` | PERMISSIVE | `{public}` | `INSERT` | *null* | `(( SELECT auth.uid() AS uid) = id)` | Base signup insert policy. |
| `Enable read for own profile or admin` | PERMISSIVE | `{public}` | `SELECT` | `((( SELECT auth.uid() AS uid) = id) OR is_staff_or_admin())` | *null* | Read access for self and active staff/admin. |
| `Enable update for users based on email` | PERMISSIVE | `{public}` | `UPDATE` | `(( SELECT auth.uid() AS uid) = id)` | *null* (re-uses `USING`) | Allows users to update their own profile row. Column grants restrict which columns they can mutate. |
| `restrict_profile_insert_to_own_auth` | RESTRICTIVE | `{authenticated}` | `INSERT` | *null* | `((id = auth.uid()) AND (email = (auth.jwt() ->> 'email'::text)))` | Hardens onboarding insert fallback against email/id spoofing (deployed in B2A-3). |

### 2.3 Live Triggers on `public.profiles`

| Trigger Name | Timing / Event | Procedure Name | Execution Mode | Logic Summary |
|---|---|---|---|---|
| `check_profile_updates_trigger` | `BEFORE UPDATE FOR EACH ROW` | `check_profile_updates()` | `SECURITY DEFINER` (postgres) | If `NEW.role`, `employment_status`, `is_blocked`, or `deleted` change: prevents self-modification, requires caller to have `role IN ('admin', 'owner')` and `deleted = false`. Prevents owner modification/creation. |
| `log_staff_status_change_trigger` | `AFTER UPDATE FOR EACH ROW` | `log_staff_status_change()` | `SECURITY DEFINER` (postgres) | Logs changes to `employment_status` or `is_blocked` for staff members to `public.staff_status_history`. Does not track customers or `deleted`. |
| `trg_sync_profile_full_name` | `BEFORE INSERT OR UPDATE OF first_name, last_name` | `sync_profile_full_name()` | `SECURITY INVOKER` (postgres) | Maintains derived column `full_name`. |
| `trg_touch_updated_at` | `BEFORE UPDATE FOR EACH ROW` | `touch_updated_at()` | `SECURITY INVOKER` (postgres) | Maintains `updated_at := now()`. |

### 2.4 Live Account Deletion System Surface

#### Table: `public.account_deletion_requests`
Columns: `id (uuid)`, `user_id (uuid)`, `reason (text)`, `status (text)`, `created_at (timestamptz)`, `processed_at (timestamptz)`, `processed_by (uuid)`.

RLS Policies:
- `Staff manage deletion requests` (PERMISSIVE, `ALL`, `{authenticated}`): `USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin())`.
- `Users read own deletion requests` (PERMISSIVE, `SELECT`, `{authenticated}`): `USING ((SELECT auth.uid() AS uid) = user_id)`.
- `Users withdraw own pending deletion request` (PERMISSIVE, `DELETE`, `{authenticated}`): `USING (((SELECT auth.uid() AS uid) = user_id) AND (status = 'pending'::text))`.

#### Relevant Stored Procedures:
1. `public.request_account_deletion(_reason text)` (`SECURITY DEFINER`):
   - Authenticated customer initiates account deletion. Verifies no unsettled reservations exist (`payment_status <> 'paid'` or rental price exceeding deposit where balance unsettled). Inserts row into `account_deletion_requests`.
2. `public.reject_account_deletion_request(_request_id uuid)` (`SECURITY DEFINER`):
   - Requires `is_staff_or_admin()`. Cancels pending request and appends audit log to `public.logs`.
3. `public.process_account_deletion(_request_id uuid)` (`SECURITY DEFINER`):
   - Requires `is_staff_or_admin()`. Validates that the customer has no unsettled reservations or pending payments. Hard-deletes non-transactional child records (`user_measurements`, `wishlists`, `wardrobe_items`, `saved_outfits`, `capsules`, `notifications`, `stock_notify_requests`, `announcement_dismissals`, `user_streaks`). Anonymizes `logs`, `feedback`, `ar_sessions`, `messages`, `reviews`. Sets `profiles` personal columns to `NULL` and `deleted = true`.

---

## 3. Customer Writer Master Inventory

The following table documents every writer sink touching customer state, its upstream caller hierarchy, runtime identity, database authority, and required architectural treatment for B2A-4.

| Repo / File / Lines | Writer Sink / Caller Path | Operation | Target Columns | Runtime Identity | Current Database Authority | Current Boundary | Target Treatment for B2A-4 | Finding Status |
|---|---|---|---|---|---|---|---|---|
| `admin-dashboard/src/pages/customers/Customers.jsx:376` | **Sink:** `supabase.from('profiles').update(...)`<br>**Caller:** `Customers.jsx:handleEditSave` → `customerService.updateCustomer` → `supabaseService.updateDocument` | `UPDATE` | `first_name`, `last_name`, `phone`, `is_blocked`, `updated_at` | `authenticated` (Admin/Staff JWT) | Column grant `UPDATE(is_blocked)` + RLS `Enable all access for admin/staff` + `check_profile_updates` trigger | Direct Client UI | `NOT JUSTIFIED DIRECT` for `is_blocked`. Must move to dedicated RPC `set_customer_block_state`. Personal fields remain `JUSTIFIED DIRECT` via service wrapper. | `DEFECT DETECTED` (Staff UI toggles status, but DB trigger rejects non-admin callers) |
| `admin-dashboard/src/pages/customers/Customers.jsx:416` | **Sink:** `supabase.from('profiles').update(...)`<br>**Caller:** `Customers.jsx:handleDelete` → `customerService.deleteCustomer` → `supabaseService.softDeleteDocument` | `UPDATE` (Soft Delete) | `deleted`, `deleted_at` *(MISSING)*, `updated_at` | `authenticated` (Admin/Staff JWT) | Column grant `UPDATE(deleted)` + RLS `Enable all access for admin/staff` + `check_profile_updates` trigger | Direct Client UI | `NOT JUSTIFIED DIRECT`. Must move to dedicated RPC `set_customer_archive_state`. | `FATAL DEFECT DETECTED` (Attempts to write non-existent `deleted_at`, failing at runtime) |
| `admin-dashboard/src/services/customerService.js:78-80` | **Sink:** `supabase.from('profiles').insert(...)`<br>**Caller:** `customerService.createCustomer` | `INSERT` | `customerData` spread, `role: 'customer'`, `deleted: false` | `authenticated` (Admin/Staff JWT) | Blocked by lack of `INSERT(role)` grant and restrictive RLS | Service Wrapper | `DEAD CODE / NO CLIENT WRITE REQUIRED`. Dead code with no active UI caller. Deprecate and remove. | `CONFIRMED` |
| `admin-dashboard/src/pages/admin/AccountDeletionRequests.jsx:71` | **Sink:** Edge Function `process-account-deletion` → `callerClient.rpc('process_account_deletion', ...)`<br>**Caller:** `AccountDeletionRequests.jsx:handleApprove` → `accountDeletionService.processAccountDeletion` | `RPC` (`UPDATE` + `DELETE`) | Personal data scrubbed (`first_name`, `last_name`, `phone`, `email`, etc. set to NULL), `deleted = true`, `updated_at` | `SECURITY DEFINER` (Called with Staff JWT via Edge Function) | Edge Function rate limiting + RPC `is_staff_or_admin()` check | Serverless Pipeline + RPC | `CONTROLLED RPC PIPELINE`. Retain Edge Function + RPC flow. Harmonize inner `deleted = true` update with `check_profile_updates` trigger. | `DEFECT DETECTED` (Trigger blocks staff members from completing execution) |
| `jezsy-mobile-app/app/profile/account-settings.tsx:77` | **Sink:** `supabase.rpc('request_account_deletion', ...)`<br>**Caller:** `account-settings.tsx:handleSubmitDeletionRequest` → `accountService.submitDeletionRequest` | `RPC` (`INSERT`) | `account_deletion_requests` row (`user_id`, `reason`) | `authenticated` (Customer JWT) | Stored Procedure `request_account_deletion` (`SECURITY DEFINER`) | Stored Procedure RPC | `CONTROLLED RPC`. Retain customer deletion request flow. Does not mutate `profiles`. | `VERIFIED CLEAN` |
| `jezsy-mobile-app/app/profile/account-settings.tsx:117` | **Sink:** `supabase.from('account_deletion_requests').delete(...)`<br>**Caller:** `account-settings.tsx:handleWithdrawDeletion` → `accountService.withdrawDeletionRequest` | `DELETE` | `account_deletion_requests` row | `authenticated` (Customer JWT) | RLS policy `Users withdraw own pending deletion request` | Direct Client Service | `JUSTIFIED DIRECT`. Customer withdraws own pending request. Does not mutate `profiles`. | `VERIFIED CLEAN` |
| `admin-dashboard/src/services/accountDeletionService.js:154` | **Sink:** `supabase.rpc('reject_account_deletion_request', ...)`<br>**Caller:** `AccountDeletionRequests.jsx:handleDecline` → `rejectAccountDeletion` | `RPC` (`UPDATE` + `INSERT`) | `account_deletion_requests.status = 'cancelled'`, audit log in `public.logs` | `authenticated` (Staff/Admin JWT) | Stored Procedure `reject_account_deletion_request` (`SECURITY DEFINER`) | Stored Procedure RPC | `CONTROLLED RPC`. Staff declines deletion request. Does not mutate `profiles`. | `VERIFIED CLEAN` |
| `jezsy-mobile-app` (All Screens & Services) | **Sink:** Mobile App Personal Mutations (`profileService.ts`, `edit.tsx`, `profile-setup.tsx`) | `UPDATE` / `UPSERT` | Personal profile fields only (`first_name`, `last_name`, `phone`, `address_*`, `username`, `fit_preference`, privacy settings, push tokens) | `authenticated` (Customer JWT) | RLS `Enable update for users based on email` | Direct Client UI / Service | `JUSTIFIED DIRECT`. Mobile app never attempts to write `is_blocked` or `deleted`. | `VERIFIED CLEAN` |

---

## 4. Critical Findings & Latent Defects

### Finding 1: Fatal Runtime Defect in Customer Deletion
- **Location:** `admin-dashboard/src/services/customerService.js:88` calling `supabaseService.js:softDeleteDocument('profiles', docId)`.
- **Mechanism:** `softDeleteDocument` executes:
  ```javascript
  const now = new Date().toISOString();
  await supabase.from(table).update({ deleted: true, deleted_at: now, updated_at: now }).eq('id', id);
  ```
- **Database Reality:** The `public.profiles` table has columns `deleted (boolean)` and `updated_at (timestamptz)`, but **does not have a `deleted_at` column**.
- **Impact:** Any attempt by an administrator to delete a customer via the trash icon in `Customers.jsx` fails instantly in PostgREST with:
  `PGRST204: Could not find the 'deleted_at' column of 'profiles' in the schema cache`
  The user is presented with a generic `toast.error('Failed to delete customer')`. Customer deletion has been completely non-functional in production.

### Finding 2: UI vs Database Role Mismatch on Customer Status Changes
- **Location:** `admin-dashboard/src/pages/customers/Customers.jsx:345` and `c:\Users\carlv\admin-dashboard\src\router\AppRouter.jsx:178`.
- **Mechanism:**
  1. The `/customers` route is accessible to both `staff` and `admin` roles (wrapped only in `<ProtectedRoute>`, without `<RequireAdmin>`).
  2. In `Customers.jsx`, the customer detail modal displays an "Edit" button to all authenticated dashboard users.
  3. The edit form includes a "Status" selector with options `Active` and `Inactive`, mapping to `isBlocked: editForm.status === 'Inactive'`.
  4. Saving submits `{ is_blocked: true/false }` to `public.profiles`.
  5. The PostgreSQL trigger `check_profile_updates()` executes `BEFORE UPDATE`:
     ```sql
     SELECT role INTO performer_role FROM public.profiles WHERE id = auth.uid() AND deleted = false;
     IF performer_role IS NULL OR performer_role NOT IN ('admin', 'owner') THEN
       RAISE EXCEPTION 'Only administrators or owners can modify role, employment status, block status, or deletion status.';
     END IF;
     ```
- **Impact:** If an active staff member attempts to suspend or activate a customer, the database rejects the update with an unhandled exception. The UI reports `Failed to update customer: Only administrators or owners can modify role...`.

### Finding 3: Trigger Exception Inside `process_account_deletion` RPC
- **Location:** Live procedure `public.process_account_deletion(_request_id uuid)`.
- **Mechanism:**
  1. The procedure specifies `IF NOT public.is_staff_or_admin() THEN RAISE EXCEPTION 'Only staff can process account deletion requests.'; END IF;`.
  2. It is configured as `SECURITY DEFINER` (executed as `postgres`), but preserves `auth.uid()`.
  3. Towards the end of the data scrub, it runs:
     ```sql
     UPDATE public.profiles
     SET
       first_name = NULL, last_name = NULL, email = NULL, phone = NULL,
       address_line = NULL, barangay = NULL, city = NULL, province = NULL, zip_code = NULL,
       date_of_birth = NULL, gender = NULL, employment_status = NULL, fit_preference = NULL,
       expo_push_token = NULL, deleted = true, updated_at = now()
     WHERE id = v_request.user_id;
     ```
  4. Modifying `deleted` causes `check_profile_updates_trigger` to fire.
  5. `check_profile_updates()` inspects `auth.uid()`, sees `performer_role = 'staff'`, and raises an exception: `'Only administrators or owners can modify role, employment status, block status, or deletion status.'`.
- **Impact:** If a staff member processes an approved account deletion request, the operation fails midway after child tables have been erased, leaving the profile unscrubbed and the request incomplete.

### Finding 4: Inconsistent Client-Side vs Database Audit Logging
- **Mechanism:** In `Customers.jsx:394-399` and `417-421`, the frontend attempts to record customer profile updates and customer archival to `public.logs` via client-side `logAction()`.
- **Vulnerability:**
  1. Client-side logging can be bypassed, dropped due to network issues, or manipulated.
  2. Direct table updates to `is_blocked` and `deleted` currently have no database trigger or RPC recording audit history (unlike staff status changes, which trigger `log_staff_status_change`).
  3. The customer detail modal relies on `getLogsForTarget('profile', selectedCustomer.docId)` to populate the "Account History" timeline. Because client logging was uncoupled from transactional database operations, historical timeline records were fragile and incomplete.

---

## 5. Authorization Model & Capability Mapping

### 5.1 Evaluation: Reuse `can_manage_staff()` vs Dedicated `can_manage_customers()`

In Phase B2A-3, we defined `can_manage_staff()` to govern employee lifecycle operations:
```sql
CREATE OR REPLACE FUNCTION public.can_manage_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND (
        p.role = 'owner'
        OR public.is_device_approved()
      )
  );
$function$;
```

We evaluate whether `can_manage_staff()` should be reused for customer moderation or if a distinct `can_manage_customers()` capability is required:

| Criterion | Reusing `can_manage_staff()` | Dedicated `can_manage_customers()` | Verdict |
|---|---|---|---|
| **Domain Separation** | Conflates internal HR/staff credential governance with external customer relationship moderation. | Maintains clean domain boundaries between staff identities and customer identities. | **Dedicated Wins** |
| **Principle of Least Privilege** | Any future relaxation or specialization of staff management authority would unintentionally bleed into customer management. | Customer management policy can evolve independently without exposing staff administrative capabilities. | **Dedicated Wins** |
| **Role Granularity** | Strictly requires `role IN ('admin', 'owner')`. Completely excludes regular staff. | Allows explicit determination of whether regular `staff` should be permitted to suspend customers or process account deletions. | **Dedicated Wins** |
| **Device Security Requirement** | Requires `is_device_approved()` (owner bypass). | Customer suspension and deletion are high-impact operations that should equally require an approved device. | **Neutral (Both require approved device)** |
| **Semantic Clarity & Auditability** | Stored procedures and RLS policies guarding customers would reference `can_manage_staff()`, obscuring intent. | Clean, self-documenting predicate: `can_manage_customers()`. | **Dedicated Wins** |

### 5.2 Architectural Recommendation: Create `can_manage_customers()`

We recommend creating `public.can_manage_customers()`:
```sql
CREATE OR REPLACE FUNCTION public.can_manage_customers()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
      AND p.deleted = false
      AND p.is_blocked = false
      AND p.employment_status = 'active'
      AND (
        p.role = 'owner'
        OR public.is_device_approved()
      )
  );
$function$;
```

> [!IMPORTANT]
> **Staff Role Moderation Decision:**  
> The live trigger `check_profile_updates` has historically restricted `is_blocked` and `deleted` to `'admin'` and `'owner'`. Restricting `can_manage_customers()` to `role IN ('admin', 'owner')` maintains backwards compatibility with this security invariant while preventing unauthorized staff members from suspending customer accounts. If the business decides that senior staff should be able to block customers, `can_manage_customers()` can be updated centrally without touching the staff security model.

---

## 6. Target Architecture & Remediation Blueprint (B2A-4)

To permanently revoke `UPDATE(is_blocked, deleted)` from `authenticated`, B2A-4 must introduce hardened RPC command endpoints and decouple personal customer profile updates from privileged status flags.

### 6.1 RPC Specifications

#### 1. `set_customer_block_state(target_customer_id uuid, new_is_blocked boolean, change_reason text)`
- **Security Mode:** `SECURITY DEFINER` (owned by `postgres`), `SET search_path TO ''`.
- **Authorization Guard:** `IF NOT public.can_manage_customers() THEN RAISE EXCEPTION 'Unauthorized: Only active administrators on approved devices can modify customer status.'; END IF;`
- **Validation:**
  - `target_customer_id` must exist in `public.profiles`.
  - Target must have `role = 'customer'`! (Staff accounts cannot be blocked via customer RPC; they must use `update_staff_status_v2`).
  - Cannot modify own account (if caller also had a customer profile).
  - Target cannot be an `owner` or `admin`.
  - `change_reason` must be provided (`length(trim(change_reason)) >= 3`).
- **Mutation:**
  - `UPDATE public.profiles SET is_blocked = new_is_blocked, updated_at = now() WHERE id = target_customer_id;`
- **Audit Contract (`public.logs`):**
  - Inserts structured audit record matching live schema:
    ```json
    {
      "user_id": "auth.uid()",
      "user_name": "Caller Name",
      "action": "Blocked customer account | Unblocked customer account",
      "target_type": "profile",
      "target_id": "target_customer_id::text",
      "details": {
        "previous_blocked": false,
        "new_blocked": true,
        "reason": "change_reason"
      }
    }
    ```
- **Return:** `jsonb_build_object('success', true, 'customer_id', target_customer_id, 'is_blocked', new_is_blocked)`

#### 2. `set_customer_archive_state(target_customer_id uuid, new_deleted boolean, change_reason text)`
- **Security Mode:** `SECURITY DEFINER` (owned by `postgres`), `SET search_path TO ''`.
- **Authorization Guard:** `IF NOT public.can_manage_customers() THEN RAISE EXCEPTION 'Unauthorized: Only active administrators on approved devices can archive customer accounts.'; END IF;`
- **Validation:**
  - Target must exist in `public.profiles` with `role = 'customer'`.
  - Target cannot have unsettled reservations or pending payments when archiving (`new_deleted = true`).
  - `change_reason` must be provided.
- **Mutation:**
  - `UPDATE public.profiles SET deleted = new_deleted, updated_at = now() WHERE id = target_customer_id;`
- **Audit Contract (`public.logs`):**
  - Inserts record into `public.logs`:
    ```json
    {
      "user_id": "auth.uid()",
      "user_name": "Caller Name",
      "action": "Archived customer account | Restored customer account",
      "target_type": "profile",
      "target_id": "target_customer_id::text",
      "details": {
        "previous_deleted": false,
        "new_deleted": true,
        "reason": "change_reason"
      }
    }
    ```
- **Return:** `jsonb_build_object('success', true, 'customer_id', target_customer_id, 'deleted', new_deleted)`

#### 3. Harmonization of `process_account_deletion` & `check_profile_updates`
- In `check_profile_updates()`: When an update occurs from within trusted `SECURITY DEFINER` procedures (`process_account_deletion`, `set_customer_block_state`, `set_customer_archive_state`), the trigger must allow authorized execution or rely on the RPC's own authorization guards.

### 6.2 Client Compatibility & Rollout Phasing

Just as in B2A-3, the deployment must follow strict dependency order to ensure zero downtime and prevent client RPC/grant race conditions:

```mermaid
graph TD
    subgraph Phase 1: Client Pre-Deployment
        A[Admin Stage A: Refactor customerService.js & Customers.jsx] --> B[Decouple personal updates from status toggle]
        B --> C[Fix softDeleteDocument / deleteCustomer call to use RPC]
        C --> D[Run Admin typecheck, lint, and build checks]
    end

    subgraph Phase 2: Database Migration
        E[Deploy Migration: can_manage_customers] --> F[Deploy set_customer_block_state RPC]
        F --> G[Deploy set_customer_archive_state RPC]
        G --> H[Harmonize check_profile_updates trigger]
        H --> I[REVOKE UPDATE is_blocked, deleted FROM authenticated, anon]
    end

    subgraph Phase 3: Verification & Closure
        J[Run Catalog Verification & ACL Checks] --> K[Run Functional Smoke Tests on Customer Moderation]
        K --> L[Verify Elimination of All Transitional Column Grants]
    end

    Phase 1 --> Phase 2 --> Phase 3
```

---

## 7. Zero-Code-Change Integrity Confirmation

During the preparation of this audit artifact:
- **No production database mutations** were executed. The live catalog remains strictly on the validated B2A-3 baseline.
- **No client application code** was altered or committed in `admin-dashboard` or `jezsy-mobile-app`.
- **No Git branches or PRs** were created.

This inventory provides the empirical foundation for authoring the Phase B2A-4 migration and client refactoring plans once reviewed and approved.
