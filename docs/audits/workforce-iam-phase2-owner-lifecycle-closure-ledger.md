# Walkthrough - Phase 2 Enterprise Workforce IAM Hardening & Owner Lifecycle Governance

Phase 2 of the **Enterprise Workforce IAM Hardening: Owner Lifecycle, Workforce MFA Governance, and Step-Up Security** architecture has been fully implemented, empirically verified against the shared live Supabase project, and verified across all local check suites.

---

## 1. Executive Summary & Live Probe Verdict

The mandatory live AMR freshness probe was executed against the shared production database and Auth service (`https://wufcmtndotfvxvvxkamv.supabase.co`). 

### Empirical Finding
1. **Dynamic AMR Claim Refresh**: When an authenticated user is already upgraded to `aal2`, invoking `challengeAndVerify` in a new 30-second interval successfully re-challenges and dynamically refreshes the token's `amr` timestamp claim (`T2 > T1`, observed age `< 1s`).
2. **Freshness Contract Enforced**: Database validator `require_recent_mfa()` accepts the refreshed token immediately (`age <= 300s`).
3. **Expiration Rejection Confirmed**: After the 5-minute window (`305s` elapsed), `require_recent_mfa()` rejected the stale token with SQLSTATE `42501` (`TOTP verification older than 5 minutes`).

```text
============================================================
PASS: native AMR freshness contract verified.
VERDICT: STEP_UP_MODE = native_amr
============================================================
```

Both Edge Function and database layers support both `native_amr` and server-witnessed `receipt` modes; with the empirical contract proven, `STEP_UP_MODE=native_amr` is the canonical mode.

---

## 2. Implemented Invariants & Security Architecture

### Invariant 1: Sole Owner Quorum Protection with MFA Reservation Exclusion
- **Target-Aware Quorum Helper**: [`assert_owner_removal_quorum(p_target_id)`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L102-L140) (`SECURITY DEFINER`, granted only to `service_role`).
- **Canonical Workforce Filter**: Evaluates active unblocked Owners using the canonical predicates:
  ```sql
  employment_status = 'active'
  AND is_blocked = false
  AND deleted = false
  AND role = 'owner'
  AND id <> p_target_id
  ```
- **MFA Reservation Awareness**: Any Owner undergoing an MFA reset is excluded from quorum availability if:
  1. `status = 'awaiting_reenrollment'` (Owner is held in recovery state without active MFA; never expires on a timer).
  2. `status = 'pending_delete' AND expires_at > now()` (Owner factor deletion is actively pending).
- **Enforcement**: If `active_owners < 1`, the helper fails closed with SQLSTATE `42501` (`Action rejected: Organization must retain at least one active, unblocked Owner with verified MFA.`).

### Invariant 2: Direct Baseline AAL2 Enforcement on Phase 1 Workforce RPCs
- **Universal Guard**: Helper [`require_aal2()`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L49-L63) (`SECURITY INVOKER`) is embedded into:
  - `update_staff_status_v2`
  - `update_staff_role_v2`
  - `set_staff_archive_state`
- **Strict Distinction Null-Bypass Guard**:
  ```sql
  IF (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'AAL2 required' USING ERRCODE = '42501';
  END IF;
  ```
  Protects against NULL evaluation bugs and guarantees that requests carrying `aal1` or missing JWT claims are rejected before workforce mutations can execute.

### Invariant 3: Fresh Step-Up Verification (Native AMR & Step-Up Receipts)
- **Native AMR Validator**: [`require_recent_mfa()`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L65-L100) (`SECURITY INVOKER`) validates that caller's JWT carries `aal2` and a `totp` entry in `amr` whose timestamp is within the last 300 seconds (`5 minutes`).
- **Bound Receipt Model**: Table `public.step_up_receipts` securely tracks step-up confirmations when operating under receipt mode, strictly bound to:
  - `actor_id` (Auth user)
  - `session_id` (Caller session UUID)
  - `action_class` (`owner_promotion`, `owner_demotion`, `owner_block`, `owner_archive`, `owner_terminate`, `mfa_reset`)
  - `target_id` (Optional target UUID)
  - `verified_at` & `expires_at` (`expires_at > verified_at` check constraint)
  - Access restricted exclusively to `service_role`.

### Invariant 4: Privileged Owner Lifecycle RPCs
All Owner mutations run as `SECURITY DEFINER` granted strictly to `service_role`, callable only via the verified Edge Function boundary:
1. [`promote_workforce_to_owner(p_actor_id, p_target_id, p_session_id, p_step_up_verified_at)`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L176-L274)
   - Acquires advisory lock `(7421, 1)`.
   - Checks caller is active Owner.
   - Validates fresh step-up (either via receipt or verified timestamp within 5 minutes).
   - Locks target row `FOR UPDATE`.
   - Requires target to be active `staff` or `admin`.
   - Records structured minimal JSONB audit log into `public.logs`.
2. [`demote_owner(p_actor_id, p_target_id, p_session_id, p_step_up_verified_at)`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L276-L373)
   - Executes `assert_owner_removal_quorum(p_target_id)`.
   - Demotes target to `admin`.
3. [`block_owner`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L375-L442), [`archive_owner`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L444-L509), and [`terminate_owner`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql#L511-L576):
   - All execute `assert_owner_removal_quorum(p_target_id)` before disabling or soft-deleting any Owner.

### Invariant 5: Workforce MFA Reset State Machine & Recovery Reservation
- **Self-Reset Prohibited**: An Owner cannot reset their own MFA factor (`p_actor_id = p_target_id` rejected with `42501`).
- **Owner Reset Quorum Pre-flight**: If target is an Owner, `assert_owner_removal_quorum` verifies that another active Owner with verified MFA exists before the reservation is created.
- **State Machine**:
  ```mermaid
  stateDiagram-v2
    [*] --> pending_delete: begin_workforce_mfa_reset()
    pending_delete --> awaiting_reenrollment: Owner target factor deleted
    pending_delete --> [*]: Staff target factor deleted (completed)
    pending_delete --> [*]: Deletion failed (cleared with mfa_reset_failed)
    awaiting_reenrollment --> [*]: complete-mfa-reset (verified TOTP enrolled)
  ```
- **Recovery State Lock**: An Owner target whose factors have been deleted enters `awaiting_reenrollment`. The reservation does not expire on a timer, guaranteeing that the recovering Owner cannot be counted towards quorum until they successfully enroll and verify a replacement TOTP factor via `complete-mfa-reset`.

### Invariant 6: Edge Function Hardening (`owner-lifecycle`)
- Located at [`supabase/functions/owner-lifecycle/index.ts`](file:///c:/Users/carlv/admin-dashboard/supabase/functions/owner-lifecycle/index.ts).
- **Server-Defined Routing**: Mutation routes and action classes are locked into constant `MUTATION_ROUTES`:
  ```ts
  const MUTATION_ROUTES = {
    'promote': { action_class: 'owner_promotion', rpc: 'promote_workforce_to_owner' },
    'demote': { action_class: 'owner_demotion', rpc: 'demote_owner' },
    'block': { action_class: 'owner_block', rpc: 'block_owner' },
    'archive': { action_class: 'owner_archive', rpc: 'archive_owner' },
    'terminate': { action_class: 'owner_terminate', rpc: 'terminate_owner' },
    'reset-mfa': { action_class: 'mfa_reset', rpc: 'begin_workforce_mfa_reset' },
  };
  ```
- **Fail-Closed STEP_UP_MODE**: Rejects any configuration other than `'native_amr'` or `'receipt'` with HTTP 500.
- **Context Separation**:
  - `callerClient` (user-scoped) validates caller identity and executes `require_recent_mfa()`.
  - `adminClient` (service-role) queries admin profiles, checks Auth Admin factors, and executes mutation RPCs.
- **Live Factor Checks**:
  - Validates that the calling actor actively possesses an enrolled and verified TOTP factor in Auth Admin.
  - On `promote`, validates that the staff target actively possesses an enrolled and verified TOTP factor in Auth Admin prior to elevation.

---

## 3. Live AMR Freshness Probe Telemetry

The live probe script [`amr_freshness_probe.ts`](file:///c:/Users/carlv/.gemini/antigravity/brain/23e0c2ff-74c7-443f-9eb8-785ca893cc09/scratch/amr_freshness_probe.ts) executed the complete end-to-end authentication and re-challenge protocol against the shared live database:

```text
=== Starting Phase 2 Deterministic Live AMR Freshness Probe ===
Target URL: https://wufcmtndotfvxvvxkamv.supabase.co
Test Account: test_harness_staff@jezsy.internal

[1/7] Signing in with password...
Signed in successfully.

[2/7] Inspecting MFA factors...
Enrolling fresh TOTP factor for probe...
Enrolled new factor: c7fd074a-93d8-4517-b7ff-1c8d88d01ba2

[3/7] Performing initial challengeAndVerify to establish AAL2...
Generated TOTP Code 1: 118449
Refreshed Token AAL: aal2
Captured T1 from AMR claim: 2026-09-15T03:46:53.000Z (1789444013)

[4/7] Waiting 9s to cross into next TOTP interval...

[5/7] Performing second challengeAndVerify in new window...
Generated fresh TOTP Code 2: 894160
Captured T2 from AMR claim: 2026-09-15T03:47:02.000Z (1789444022)
T2 > T1 confirmed. T2 is 0.9s old.

[6/7] Invoking require_recent_mfa() RPC immediately...
Immediate require_recent_mfa() succeeded as expected.

[7/7] Waiting 305 seconds (> 5 minutes) to test expiration rejection...
Time remaining: 305s...
...
Time remaining: 5s...
Re-invoking require_recent_mfa() after expiry...
Expected rejection after >5 min: TOTP verification older than 5 minutes

========================================
PASS: native AMR freshness contract verified.
VERDICT: STEP_UP_MODE=native_amr
========================================

Cleaning up: unenrolling probe factor...
Factor unenrolled cleanly.
```

---

## 4. Phase 2 Verification Ledger

| # | Test Scenario / Contract | Target Layer | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **V-01** | `require_aal2()` without JWT claims | PostgreSQL Invoker RPC | SQLSTATE `42501` | Caught `42501: AAL2 required` | **PASSED** |
| **V-02** | `require_aal2()` with `aal1` claim | PostgreSQL Invoker RPC | SQLSTATE `42501` | Caught `42501: AAL2 required` | **PASSED** |
| **V-03** | `require_aal2()` with `aal2` claim | PostgreSQL Invoker RPC | Success (void) | Executed cleanly | **PASSED** |
| **V-04** | `require_recent_mfa()` with stale TOTP (>300s) | PostgreSQL Invoker RPC | SQLSTATE `42501` | Caught `42501: TOTP verification older than 5 minutes` | **PASSED** |
| **V-05** | `require_recent_mfa()` with fresh TOTP (30s ago) | PostgreSQL Invoker RPC | Success (void) | Executed cleanly | **PASSED** |
| **V-06** | `assert_owner_removal_quorum` targeting sole Owner | PostgreSQL Definer RPC | SQLSTATE `42501` | Rejected: `Action rejected: Organization must retain at least one active, unblocked Owner...` | **PASSED** |
| **V-07** | Quorum evaluation with 2 active Owners | PostgreSQL Definer RPC | Success (void) | Target can be removed; quorum satisfied | **PASSED** |
| **V-08** | Quorum with 2nd Owner in `awaiting_reenrollment` | PostgreSQL Definer RPC | SQLSTATE `42501` | Rejected: 2nd Owner excluded from quorum | **PASSED** |
| **V-09** | Quorum with 2nd Owner in `pending_delete` (active) | PostgreSQL Definer RPC | SQLSTATE `42501` | Rejected: 2nd Owner excluded from quorum | **PASSED** |
| **V-10** | Quorum with 2nd Owner in `pending_delete` (expired) | PostgreSQL Definer RPC | Success (void) | Passed: Expired reservation unblocks quorum | **PASSED** |
| **V-11** | `chk_mfa_reservation_expiry` table constraint | PostgreSQL DDL | SQLSTATE `23514` | Rejected if `expires_at <= reserved_at` | **PASSED** |
| **V-12** | `promote_workforce_to_owner` without step-up | PostgreSQL Definer RPC | SQLSTATE `42501` | Rejected: `Valid step-up verification required` | **PASSED** |
| **V-13** | `promote_workforce_to_owner` with stale step-up | PostgreSQL Definer RPC | SQLSTATE `42501` | Rejected: `Step-up verification expired or invalid` | **PASSED** |
| **V-14** | `promote_workforce_to_owner` with fresh step-up | PostgreSQL Definer RPC | Role updated to `owner` | Role set to `owner`, structured log written | **PASSED** |
| **V-15** | `demote_owner` with fresh step-up | PostgreSQL Definer RPC | Role updated to `admin` | Role set to `admin`, structured log written | **PASSED** |
| **V-16** | Self-reset via `begin_workforce_mfa_reset` | PostgreSQL Definer RPC | SQLSTATE `42501` | Rejected: `Self-reset prohibited` | **PASSED** |
| **V-17** | Duplicate active MFA reset on same target | PostgreSQL Definer RPC | SQLSTATE `42501` | Rejected: `Another MFA reset is already pending...` | **PASSED** |
| **V-18** | MFA reset state transition to `awaiting_reenrollment` | PostgreSQL Definer RPC | Row status updated | Row updated to `awaiting_reenrollment`, log written | **PASSED** |
| **V-19** | Reservation clearance via `clear_mfa_reset_reservation` | PostgreSQL Definer RPC | Row deleted | Row cleanly removed, clearance log written | **PASSED** |
| **V-20** | `update_staff_status_v2` baseline AAL2 check | Phase 1 RPC | SQLSTATE `42501` | Rejects `aal1` with `AAL2 required` | **PASSED** |
| **V-21** | `update_staff_role_v2` baseline AAL2 check | Phase 1 RPC | SQLSTATE `42501` | Rejects `aal1` with `AAL2 required` | **PASSED** |
| **V-22** | `set_staff_archive_state` baseline AAL2 check | Phase 1 RPC | SQLSTATE `42501` | Rejects `aal1` with `AAL2 required` | **PASSED** |
| **V-23** | Mobile App TypeScript typecheck | Expo / Mobile Client | Exit code 0 | Clean compilation (`tsc --noEmit`) | **PASSED** |
| **V-24** | Mobile App ESLint check | Expo / Mobile Client | Exit code 0 | Clean lint (`expo lint`) | **PASSED** |
| **V-25** | Admin Dashboard TypeScript typecheck | Vite / React Client | Exit code 0 | Clean compilation (`tsc --noEmit`) | **PASSED** |
| **V-26** | Admin Dashboard ESLint check | Vite / React Client | Exit code 0 | 0 errors (`npm run lint`) | **PASSED** |
| **V-27** | Admin Dashboard Unit & Integration Tests | Jest Test Runner | Exit code 0 | 32 suites passed, 271 tests passed | **PASSED** |
| **V-28** | Admin Dashboard Production Build | Vite / Rolldown Build | Exit code 0 | Built in 2.01s (`npm run build`) | **PASSED** |
| **V-29** | Live AMR Freshness Contract Probe | Auth Service & RPCs | Contract Verified | T2 > T1 confirmed, 305s expiry rejected | **PASSED** |

---

## 5. Artifacts & Code Reference

- **Canonical Migration**: [`supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql)
- **Rollback Migration**: [`supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql.rollback`](file:///c:/Users/carlv/jezsy-mobile-app/supabase/migrations/20260915130000_phase2_owner_lifecycle_and_mfa.sql.rollback)
- **Edge Function**: [`supabase/functions/owner-lifecycle/index.ts`](file:///c:/Users/carlv/admin-dashboard/supabase/functions/owner-lifecycle/index.ts)
- **Deterministic Live Probe**: [`scratch/amr_freshness_probe.ts`](file:///c:/Users/carlv/.gemini/antigravity/brain/23e0c2ff-74c7-443f-9eb8-785ca893cc09/scratch/amr_freshness_probe.ts)
- **Mobile Types**: [`jezsy-mobile-app/src/types/database.types.ts`](file:///c:/Users/carlv/jezsy-mobile-app/src/types/database.types.ts)
- **Dashboard Types**: [`admin-dashboard/src/types/database.types.ts`](file:///c:/Users/carlv/admin-dashboard/src/types/database.types.ts)
