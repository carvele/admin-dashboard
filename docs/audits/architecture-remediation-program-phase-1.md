# Architecture Remediation Program — Phase 1: High-Risk Authorization & Transaction Boundaries

**Program Document ID**: `ARCH-REMED-PHASE-1-20260910`  
**Parent Synthesis**: `ARCH-SYNTH-ULTRA-20260910-V2`  
**Target Repositories**: `carvele/jezsy-mobile-app`, `carvele/admin-dashboard`  
**Target Environment**: Supabase Production Database (`wufcmtndotfvxvvxkamv`)  
**Status**: **READY FOR EXECUTION**  
**Execution Lead**: Pair Programming (Antigravity + User)  

---

## 1. Executive Scope & Objective

Phase 1 of the Architecture Remediation Program directly executes against the **P0 Security, Privacy, and Transaction Boundary Vulnerabilities** identified in the Architecture Synthesis Ultra report. 

Rather than broad refactoring, Phase 1 establishes strictly governed database command boundaries and closes five high-risk integrity defects across social connections, public discovery, customer moderation, account deletion, and inventory concurrency.

### Target Workstreams & Immutable Finding IDs
1. **Gate 0 (Immediate Pre-Requisite)**: Pass E Operational Activation — Enable HaveIBeenPwned leaked password protection in Supabase Auth (`SEC-E-001`).
2. **Workstream 1.1**: Bilateral Connection State Machine & Self-Accept Prevention (`SOC-001`, `SOC-002`).
3. **Workstream 1.2**: Interpersonal Block Enforcement in Public Social Discovery (`SOC-003`).
4. **Workstream 1.3**: Customer Moderation Capability & Trigger Alignment (`B2A-4a`).
5. **Workstream 1.4**: Account Deletion Staff / Trigger Conflict Resolution (`B2A-4a`).
6. **Workstream 1.5**: Inventory Mutation Concurrency Boundary (`B3-a`).

---

## 2. Gate 0: Pass E Operational Activation (Supabase Dashboard)

Before executing Phase 1 schema changes, officially close the outstanding item from the Security Hardening Lifecycle:

1. **Dashboard Configuration**:
   - Open Supabase Dashboard for `wufcmtndotfvxvvxkamv` $\to$ **Authentication** $\to$ **Password Protection**.
   - Toggle **Check passwords against HaveIBeenPwned database**.
2. **Smoke Test Protocol**:
   - Call `/auth/v1/signup` with known breached password (e.g. `Password123!`) $\rightarrow$ Assert `422/400` rejection.
   - Call `/auth/v1/signup` with unique strong password $\rightarrow$ Assert success.
3. **Advisor Verification**:
   - Re-fetch `get_advisors(type: 'security')`.
   - Confirm `auth_leaked_password_protection` warning count drops from **1 to 0**.

---

## 3. Workstream Execution Blueprints

### Workstream 1.1: Bilateral Connection State Machine & Self-Accept Prevention
- **Defects Addressed**: `[SOC-001]` (Block resurrection via raw upsert), `[SOC-002]` (Unilateral self-acceptance of connection requests).
- **Root Problem**: `app/network.tsx` issues raw `.upsert()` and `.update()` calls against `public.connections`. The RLS policies only evaluate row membership without inspecting prior row state or transition validity.
- **Database Remediation**:
  1. Author a dedicated `BEFORE UPDATE` trigger on `public.connections`:
     ```sql
     CREATE OR REPLACE FUNCTION public.tr_connections_enforce_state_machine()
     RETURNS TRIGGER
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path = public, pg_temp
     AS $$
     BEGIN
       -- Prevent unblocking via status change (must call unblock RPC)
       IF OLD.status = 'blocked' AND NEW.status != 'blocked' THEN
         RAISE EXCEPTION 'Cannot modify or unblock an existing block directly'
           USING ERRCODE = '42501';
       END IF;

       -- Prevent self-accepting outgoing pending requests (SOC-002)
       IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
         IF OLD.action_user_id = auth.uid() THEN
           RAISE EXCEPTION 'Cannot accept your own outgoing connection request'
             USING ERRCODE = '42501';
         END IF;
       END IF;

       RETURN NEW;
     END;
     $$;
     ```
  2. Author authoritative transactional RPCs:
     - `public.send_connection_request(p_target_user_id uuid)`
     - `public.accept_connection_request(p_sender_user_id uuid)`
     - `public.reject_connection_request(p_sender_user_id uuid)`
     - `public.block_user_connection(p_target_user_id uuid)`
     - `public.unblock_user_connection(p_target_user_id uuid)`
  3. Tighten RLS on `public.connections`: Revoke direct client `UPDATE` from `authenticated`, restricting connection status mutations exclusively to the audited RPCs.
- **Mobile Client Remediation**:
  - Refactor `app/network.tsx` (`handleConnect`, `handleAccept`, `handleBlock`) to invoke the RPC endpoints instead of direct `.upsert()`/`.update()`.

---

### Workstream 1.2: Interpersonal Block Enforcement in Public Social Discovery
- **Defect Addressed**: `[SOC-003]` (Discovery RPCs enforce global moderation but omit per-pair blocks).
- **Root Problem**: `get_public_profiles`, `search_public_profiles`, and `resolve_username` only check `COALESCE(p.is_blocked, false) = false`, allowing blocked users to discover, resolve `@username`, and inspect profile cards of the user who blocked them.
- **Database Remediation**:
  - Update all three accessors to integrate the hardened `is_blocked_between()` primitive:
  ```sql
  -- In search_public_profiles(p_query text, p_exclude_id uuid):
  WHERE ...
    AND COALESCE(p.deleted, false) = false
    AND COALESCE(p.is_blocked, false) = false
    AND (
      auth.uid() IS NULL 
      OR NOT public.is_blocked_between(auth.uid(), p.id)
    )

  -- In resolve_username(p_username text):
  -- Return NULL if caller is blocked by the target user or vice versa.
  ```
- **Verification**: Assert that when Bob blocks Alice, searching for Bob by username or ID as Alice returns 0 results, while unblocked third parties find Bob normally.

---

### Workstream 1.3: Customer Moderation Capability & Trigger Alignment
- **Defect Addressed**: `[B2A-4a]` (Admin UI exposes customer Active/Blocked toggles to staff, but trigger `check_profile_updates` rejects non-admins with an unhandled exception).
- **Root Problem**: Split authorization: UI relies on generic `is_staff_or_admin()`, while the database trigger strictly requires `auth.uid()` to have `role IN ('admin', 'owner')`.
- **Database Remediation**:
  1. Formalize a dedicated database capability predicate:
     ```sql
     CREATE OR REPLACE FUNCTION public.can_manage_customers()
     RETURNS boolean
     LANGUAGE plpgsql
     STABLE SECURITY DEFINER
     SET search_path = public, pg_temp
     AS $$
     BEGIN
       RETURN EXISTS (
         SELECT 1 FROM public.profiles p
         JOIN public.devices d ON d.user_id = p.id
         WHERE p.id = auth.uid()
           AND p.role IN ('staff', 'admin', 'owner')
           AND COALESCE(p.is_blocked, false) = false
           AND COALESCE(p.deleted, false) = false
           AND (p.role = 'owner' OR p.employment_status = 'active')
           AND (p.role = 'owner' OR d.is_approved = true)
       );
     END;
     $$;
     ```
  2. Author transactional RPC `public.set_customer_block_state(target_customer_id uuid, new_is_blocked boolean, change_reason text)` that checks `can_manage_customers()` and writes audit history to `public.logs`.
  3. Update `check_profile_updates` trigger to permit `is_blocked` mutations executed via `can_manage_customers()`.
- **Admin Client Remediation**:
  - In `admin-dashboard/src/services/customerService.js`, replace raw `updateDocument` calls on `is_blocked` with `supabase.rpc('set_customer_block_state', ...)`.

---

### Workstream 1.4: Account Deletion Staff / Trigger Conflict Resolution
- **Defect Addressed**: `[B2A-4a]` (RPC `process_account_deletion` allows staff via `is_staff_or_admin()`, but internal `UPDATE profiles SET deleted = true` trips `check_profile_updates` trigger; Admin `deleteCustomer` attempts to write non-existent `deleted_at`).
- **Database Remediation**:
  1. Update `check_profile_updates` trigger to permit `deleted = true` updates when executed through `process_account_deletion` or by actors possessing `can_manage_customers()`.
  2. Update RPC `process_account_deletion(_request_id uuid)` to run as a trusted transaction, verifying approval status and writing audit records.
- **Admin Client Remediation**:
  - In `admin-dashboard/src/services/customerService.js`, fix `deleteCustomer()`: purge the hallucinated `softDeleteDocument` call that targets `deleted_at`, and route archival via RPC `set_customer_archive_state` or `process_account_deletion`.

---

### Workstream 1.5: Inventory Mutation Concurrency Boundary
- **Defect Addressed**: `[B3-a]` (Admin `Inventory.jsx` performs client-side stock calculation `quantity = current - 1` then raw `.update()`).
- **Database Remediation**:
  - Ensure all stock adjustments route through transactional RPC `public.adjust_inventory_on_hand(p_inventory_id uuid, p_delta integer, p_reason text)` which locks the variant row (`FOR UPDATE`), verifies non-negative availability (`available >= 0`), and records stock movements in `public.stock_movements`.
  - Revoke direct `UPDATE(total, reserved, available)` privileges on `public.inventory` from the general `authenticated` client role.
- **Admin Client Remediation**:
  - In `admin-dashboard/src/services/inventoryService.js` and `Inventory.jsx`, replace client arithmetic and raw updates with `adjust_inventory_on_hand` calls.

---

## 4. Phase 1 Implementation Sequence & PR Staging

```
  Step 1: Gate 0 — Pass E Operational Activation (Dashboard)
          │  Assert HIBP active; Advisor warning drops from 1 to 0
          ▼
  Step 2: Database Migration Pack (jezsy-mobile-app)
          │  - Trigger connections_enforce_state_machine
          │  - RPCs: send/accept/block/unblock connections
          │  - Discovery RPCs: add is_blocked_between filter
          │  - Capability can_manage_customers & trigger alignment
          │  - Idempotent migration + .sql.rollback
          │  - Execute verify_phase1_suite.sql (multi-role JWT simulation)
          ▼
  Step 3: Mobile Client Integration (jezsy-mobile-app PR)
          │  - Update app/network.tsx & app/user/[id].tsx to use new RPCs
          │  - Run typecheck and lint
          ▼
  Step 4: Admin Dashboard Integration (admin-dashboard PR)
          │  - Replace raw updates in customerService.js & Inventory.jsx
          │  - Fix deleteCustomer to target deleted: boolean via RPC
          │  - Run typecheck and lint
          ▼
  Step 5: Gate 1 Exit Verification
             Complete live multi-role verification suite passes
```

---

## 5. Gate 1 Verification Criteria (Exit Gate)

Phase 1 cannot be marked complete until all following assertions pass against the live shared database:

| Workstream | Test Assertion | Expected Result | Status |
| :--- | :--- | :--- | :---: |
| **Pass E** | Call signup with compromised password | HTTP 422/400 (Rejected) | Pending |
| **SOC-001** | User B attempts upsert/update to overwrite block from User A | Rejected by DB Trigger / RPC (42501) | Pending |
| **SOC-002** | User A attempts to set own outgoing pending request to `accepted` | Rejected by DB Trigger / RPC (42501) | Pending |
| **SOC-003** | User B searches for User A after being blocked | Returns 0 rows / NULL | Pending |
| **B2A-4a** | Staff member toggles customer active/blocked status | Succeeded via RPC; audit log written | Pending |
| **B2A-4a** | Customer attempts direct table update on `is_blocked` or `deleted` | Rejected by RLS / Trigger (42501) | Pending |
| **B2A-4a** | Staff member processes approved account deletion | Succeeded without trigger crash | Pending |
| **B3-a** | Concurrent inventory adjustments on variant row | Atomic delta applied; `available = total - reserved` held | Pending |
| **Builds** | Mobile & Admin local checks | `tsc --noEmit` and `lint` pass with 0 errors | Pending |

---

## 6. Readiness Statement

The database baseline is frozen, the closure ledger is canonical, and the Architecture Synthesis Ultra report is finalized. 

**Execution of Phase 1 is ready to begin upon user confirmation.**
