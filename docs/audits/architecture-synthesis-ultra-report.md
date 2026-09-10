# Architecture Synthesis Ultra: Cross-Platform Systemic Analysis

**Document ID**: `ARCH-SYNTH-ULTRA-20260910-V2`  
**Target Systems**: `carvele/jezsy-mobile-app`, `carvele/admin-dashboard`, Supabase Production Database (`wufcmtndotfvxvvxkamv`)  
**Input Audits Ingested**:
- `admin-strategic-remediation-baseline.md` (`STRAT-001` through `STRAT-006`)
- `customer-command-writer-inventory.md` (`B2A-4a`)
- `inventory-writer-inventory.md` (`B3-a`)
- `profile-writer-inventory.md` (`B2A-2a`, `B2A-3`)
- `mobile-social-layer-user-discovery-audit.md` (`SOC-001` through `SOC-010`)
- `security-performance-hardening-closure-ledger.md` (`SEC-A1` through `SEC-F`, Post-F3 Stages 1 & 2)
**Status**: **SYNTHESIS FINALIZED — READY FOR PHASE 1 EXECUTION**  
**Date**: September 10, 2026  

---

## 1. Executive Summary

Over the past remediation passes, the backend database layer was systematically hardened: 83 multiple permissive policies were eliminated (`MPP = 0`), RLS InitPlan evaluations were reduced to 0, search paths were pinned, and anonymous RPC attack surfaces were sealed, leaving four canonical, explicitly reviewed public endpoints. 

However, synthesizing the historical audit ledgers across **Admin Dashboard**, **Mobile App**, and **Database Contracts** reveals that while database-level SQL injection and unauthenticated privilege escalation have been contained, the platform suffers from acute architectural friction at application and transaction boundaries.

The core systemic vulnerabilities and architectural problems are:
1. **Authorization & State-Transition Integrity Flaws**: Client UIs bypass state machine invariants on `connections` (enabling blocked users to resurrect requests and users to unilaterally self-accept outgoing requests), while public discovery RPCs bypass interpersonal block contracts.
2. **Capability Matrix Disconnects**: Administrative screens expose customer moderation and account-deletion controls to staff roles that the underlying database BEFORE UPDATE triggers actively reject, creating a false presentation of authority that crashes at runtime.
3. **Presentation-Layer DML Bypassing Domain Services**: React presentation views in both applications directly execute raw `.insert()`, `.update()`, and `.delete()` queries against Supabase tables rather than routing mutations through typed command services.
4. **Three-Way Schema & Contract Drift**: Independent, conflicting models of the database schema exist across PostgreSQL, the mobile app, and the admin dashboard (which still retains legacy Firestore types and assumes non-existent columns like `deleted_at`, throwing PostgREST `PGRST204` errors).
5. **Observability Black Holes & Silent Error Swallowing**: Authorization rejections, RLS denials (`42501`), and runtime exceptions are swallowed into client-side `console.log` statements without structured telemetry.

---

## 2. Systemic Anti-Patterns & Concrete Vulnerabilities

### Priority 0: Authorization, State-Transition, and Privacy Vulnerabilities

#### 1. Connection State Machine Invariants Defeated via Direct Client DML
- **Vulnerability Proof**:
  - `[SOC-001]`: In `app/network.tsx`, `handleBlock` and `handleConnect` both issue raw `.upsert()` calls against `public.connections`. The `FOR UPDATE` RLS policy does not exclude rows where the actor was blocked by the other party. Consequently, when User B is blocked by User A, User B can issue an upsert that overwrites User A's `status = 'blocked'` record with `status = 'pending'`, unilaterally erasing the block without User A's consent.
  - `[SOC-002]`: The `connections` `FOR UPDATE` policy `WITH CHECK` clause only asserts `action_user_id = auth.uid()`. It never inspects `OLD.action_user_id` or `OLD.status`. Therefore, User A can send a pending request to User B and immediately issue an update setting `status = 'accepted'`, unilaterally granting themselves connection-gated wardrobe/wishlist visibility and P2P direct chat eligibility.
- **Architectural Root Cause**: State transitions on bilateral domain relationships are implemented as direct table updates governed solely by declarative RLS rather than encapsulated within an authoritative, transactional state machine.

#### 2. Interpersonal Block Bypass in Public Discovery Surfaces
- **Vulnerability Proof**:
  - `[SOC-003]`: The social discovery RPCs (`get_public_profiles`, `search_public_profiles`, and `resolve_username`) filter only on the global administrative moderation flag `COALESCE(profiles.is_blocked, false) = false`. None of them query `public.connections` or call `is_blocked_between()`.
- **Architectural Root Cause**: While content access (wishlists, wardrobes, and outfits) was strictly hardened in Pass A1 to enforce `is_blocked_between()`, the discovery accessors were authored with an incomplete privacy contract, allowing blocked parties to search for, resolve, and view profile cards of the user who blocked them.

#### 3. Administrative Capability & Trigger Disconnects
- **Vulnerability Proof**:
  - `[B2A-4a]`: In `admin-dashboard/src/pages/customers/Customers.jsx`, staff members are shown toggles to activate/block customers. When clicked, `customerService.updateCustomer()` issues an update to `profiles.is_blocked`. The database trigger `check_profile_updates` raises an unhandled exception because only `admin` and `owner` roles are permitted to modify `is_blocked`.
  - `[B2A-4a]`: RPC `process_account_deletion` authorizes any active staff member via `is_staff_or_admin()`. However, its internal statement `UPDATE public.profiles SET deleted = true` fires `check_profile_updates`, which rejects staff execution.
  - `[B3-a]`: Inventory adjustments in `Inventory.jsx` perform client-side stock arithmetic (`quantity = current - 1` then `.update()`), inviting race conditions and violating database CHECK constraints under concurrent sales.
- **Architectural Root Cause**: Business logic is duplicated and fractured across UI presentation gates, RLS policies, and database triggers without a single source of capability truth.

---

### Priority 1: Structural Architecture & Contract Inconsistencies

#### 4. Presentation-Layer Direct DML & Lack of Command Boundaries
- **Anti-Pattern Proof**:
  - `[STRAT-003]`: Presentation views across `StaffManagement.jsx`, `Settings.jsx`, `DeviceManagement.jsx`, `ProductForm.jsx`, `ARAssets.jsx`, and `AuthContext.jsx` execute raw `.update()`, `.insert()`, and `.delete()` queries directly from UI handlers.
  - `[B2A-4a]`: Customer management views directly call generic document updater utilities rather than domain command services.
- **Target Pattern**:
  ```text
  React UI Component
          ↓
  Typed Domain Command Service
          ↓
  ├─ Ordinary owner-scoped CRUD ──► Supabase Table Client (where RLS is sufficient)
  └─ State transition / Privileged / Auditable ──► Transactional SECURITY DEFINER RPC
  ```

#### 5. Three-Way Schema and Type Drift
- **Anti-Pattern Proof**:
  - `[STRAT-005]`: Admin `src/types/index.ts` contains legacy **Firestore** definitions (`createdAt: string | Date | number | Record<string, number>`).
  - `[STRAT-001]`: Admin ESLint disables `@typescript-eslint/no-explicit-any`, allowing `any` casts across top navigation, sidebars, and garment ingestion.
  - `[B2A-4a]`: `customerService.deleteCustomer()` calls `softDeleteDocument()`, attempting to write to non-existent column `deleted_at` and failing with PostgREST `PGRST204`.
  - `[SOC-004]`: Mobile screen `app/user/[id].tsx` titles a section "Wardrobe" but queries `wishlists` gated on `wardrobe_privacy`.

#### 6. Observability Black Holes & Silent Error Swallowing
- **Anti-Pattern Proof**:
  - `[STRAT-002]`: Admin operations lack structured operational telemetry (`logger.info`/`logger.error` with role, entity, and action context).
  - `[SOC-010]`: Mutation catch blocks across `network.tsx`, `user/[id].tsx`, and `chat/[id].tsx` swallow RLS denials (`42501`) and RPC exceptions into `console.log` with generic toast popups.

#### 7. Half-Shipped Features & Dead Code Proliferation
- **Anti-Pattern Proof**:
  - `[SOC-006]`: Product detail screen duplicated a 90-line JSX block for "Loved By" social proof three times while the controlling setter was never called.
  - `[SOC-007]`: Backend functions `get_suggested_connections()` and `get_public_outfits_for_product()` exist with zero client callers.
  - `[SOC-005]`: Profile setup and edit screens manage `username` state in upsert payloads but render no `TextInput` component for users to enter a handle.

---

## 3. Domain-Model Drift Matrix

| Domain Entity | Backend Truth (Supabase DB) | Admin Dashboard Assumption | Mobile App Assumption | Systemic Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Profile Archival** | `profiles.deleted` (`boolean`) | `profiles.deleted_at` (`timestamp`) | Uses `request_account_deletion` | Admin deletion fails at runtime (`PGRST204`). |
| **Customer Moderation** | `check_profile_updates` rejects non-admins | Staff can toggle Active/Blocked | No moderation UI | Staff operations throw unhandled DB exceptions. |
| **Inventory Stock** | Variant row `(product_id, size, color, pattern)` in `inventory` | Direct client-side stock calculation (`stock - 1`) | Reads derived `products.stock` | Concurrency races and stock ledger drift. |
| **Social Privacy** | Bilateral per-pair blocks in `connections` | Moderation flag `profiles.is_blocked` | Treats global block and pair block as interchangeable | Privacy leak in user search and username resolution. |
| **Timestamps** | ISO 8601 UTC strings from PostgreSQL | Firebase `Timestamp` / `Record<string, number>` | Standard ISO strings | Type errors and parsing discrepancies across platforms. |

---

## 4. Single Source of Truth Capability Architecture

To eliminate the split authorization problem between UI controls, RLS policies, and database triggers, the platform must adopt a **single database-projected capability model**:

```text
[Database Context]
  auth.uid() 
  + profiles.role 
  + profiles.employment_status 
  + profiles.is_blocked 
  + devices.is_approved
          ↓
[Authoritative Database Capability Predicates]
  - public.can_manage_staff()
  - public.can_manage_customers()
  - public.can_adjust_inventory()
  - public.is_admin_or_owner()
          ↓
  ┌────────────────────────────────────────┴────────────────────────────────────────┐
  ▼                                                                                 ▼
[Database Enforcement]                                                   [Client Projection RPC]
- RLS Policies                                                           - public.get_my_capabilities()
- BEFORE UPDATE Triggers                                                           ↓
- Transactional RPCs                                                     [Typed Client Context]
                                                                         - Admin UI renders ONLY 
                                                                           authorized actions
```

---

## 5. Sequenced Architecture Remediation Program with Gates

```
  [Pre-Requisite] Gate 0: Pass E Operational Activation (Dashboard HIBP Toggle)
          │
          ▼
  Phase 1: Authorization & Transaction Boundary Remediation (P0 Security & Privacy)
          │  Gate 1: Multi-role JWT simulation passes for connections, moderation, and discovery
          ▼
  Phase 2: Canonical Contracts & Schema Synchronization (P1 Types & Drift)
          │  Gate 2: Generated types match committed migrations; zero Firestore types; lint passes
          ▼
  Phase 3: Command Boundary & Service Layer Refactoring (P1/P2 Architecture)
          │  Gate 3: Zero direct table DML in React presentation components
          ▼
  Phase 4: Unified Observability & Telemetry (P2 Telemetry)
          │  Gate 4: Sentry captures RLS rejections and RPC errors with contextual metadata
          ▼
  Phase 5: Dead Code Pruning & Feature Completion (P3 Polish)
             Gate 5: Clean tree; zero unreferenced RPCs or unrendered form inputs
```

### Pre-Requisite: Gate 0 — Pass E Operational Activation
- **Action**: Enable HaveIBeenPwned leaked password protection in the Supabase Dashboard.
- **Verification Gate**: Execute negative smoke test (reject compromised password) and positive smoke test (accept strong password). Confirm `auth_leaked_password_protection` drops to 0 in Security Advisor.

### Phase 1: Authorization, State-Transition, and Privacy Remediation (P0)
- **Workstreams**:
  1. *Connections State Machine*: Author transactional RPCs `request_connection`, `accept_connection`, `block_user`, and `unblock_user`. Revoke direct client `UPDATE`/`UPSERT` on `public.connections`. Eliminate `SOC-001` and `SOC-002`.
  2. *Bilateral Block Enforcement in Discovery*: Add `AND NOT public.is_blocked_between((select auth.uid()), p.id)` to `get_public_profiles`, `search_public_profiles`, and `resolve_username`. Eliminate `SOC-003`.
  3. *Customer Moderation Capability Alignment*: Create `can_manage_customers()` capability predicate, update `check_profile_updates` trigger, and route customer status updates through transactional RPC `admin_set_customer_status`. Eliminate `B2A-4a`.
  4. *Account Deletion Alignment*: Ensure `process_account_deletion` executes under owner privilege or harmonizes with `check_profile_updates`. Eliminate `B2A-4a`.
  5. *Inventory Concurrency Boundary*: Enforce transactional RPCs for all stock increments/decrements. Ban client-side math. Eliminate `B3-a`.
- **Verification Gate**: Multi-role SQL test suite verifying that blocks cannot be overwritten, connection requests cannot be self-accepted, blocked users are invisible in discovery, and staff customer status mutations succeed without trigger crashes.

### Phase 2: Canonical Contracts & Schema Synchronization (P1)
- **Workstreams**:
  1. Generate canonical `database.types.ts` tied strictly to committed migration versions.
  2. Purge all legacy Firestore definitions from `admin-dashboard/src/types/index.ts`.
  3. Fix non-existent column assumptions in Admin (replace `deleted_at` with `deleted: boolean`).
  4. Re-enable strict compiler checks in `admin-dashboard/eslint.config.js`.
- **Verification Gate**: `npm run typecheck` and `npm run lint` pass across both repositories with zero `any` masking.

### Phase 3: Command Boundary & Service Layer Refactoring (P1/P2)
- **Workstreams**:
  1. Refactor Admin presentation views (`StaffManagement`, `Settings`, `DeviceManagement`, `ProductForm`, `ARAssets`) to route mutations through typed domain services.
  2. Enforce the command boundary rule: ordinary owner CRUD uses Supabase client with RLS; multi-row, state-transition, or privileged operations use transactional RPCs.
- **Verification Gate**: Static code scan verifying zero `.from('...').insert/update/delete` calls within React component files.

### Phase 4: Unified Observability & Telemetry (P2)
- **Workstreams**:
  1. Replace `console.log` swallowing in mutation catch blocks with structured error telemetry (Sentry).
  2. Ensure all RPC failures and RLS denials (`42501`) capture caller UID, role, target resource, and error code.
- **Verification Gate**: Simulated error injection confirms exceptions appear with complete stack traces and contextual metadata in monitoring.

### Phase 5: Dead Code Pruning & Feature Completion (P3)
- **Workstreams**:
  1. Wire `get_suggested_connections()` to the Mobile Search tab suggestions section (`SOC-007`).
  2. Wire `get_public_outfits_for_product()` to product detail "Styled By" section (`SOC-007`).
  3. Add `TextInput` control for `username` in `profile-setup.tsx` and `profile/edit.tsx` (`SOC-005`).
  4. Delete orphaned legacy service files in Admin (`STRAT-006`).
- **Verification Gate**: Zero dead JSX blocks; complete end-to-end verification of social discovery and username onboarding.

---

## 6. Tooling Observations & Environmental Signals

1. **Local TypeScript Memory Signal**:
   - Architecture synthesis execution encountered a local V8 heap exhaustion during one full-repo TypeScript run. Other lifecycle verification runs completed successfully. Treat as an environment/tooling reliability signal pending reproduction, not yet a confirmed repository architecture defect.
2. **Absence of Client Component Integration Tests**:
   - Neither client repository maintains an automated integration test suite (Jest/React Testing Library for routes). Automated regression coverage must be introduced alongside the Phase 3 domain service refactor.
