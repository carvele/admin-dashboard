# Canonical Security Contract & Architecture Re-Freeze: Workforce IAM Single-Owner Model & AAL1 Policy Amendment

**Document ID**: `docs/audits/workforce-iam-single-owner-aal1-refreeze.md`  
**Effective Date**: 2026-09-16  
**Status**: **CANONICAL & FROZEN**  
**Target Production Database**: `wufcmtndotfvxvvxkamv` (`JezSy-Collection`)  
**Applied Production Migration**: `20260916233000_remove_staff_rpc_aal2_requirement.sql`  
**Superseded Documents**: `rbac-production-cutover-runbook.md` (v2.1 dual-owner TOTP runbook)

---

## 1. Executive Summary & Policy Amendment

On 2026-09-16, the workforce security policy for JezSy was formally amended from a dual-owner mandatory-TOTP model to a **Single-Owner In-Dashboard Model with Tiered Authentication**.

The prior assumption that routine staff mutations must require third-party TOTP step-up (AAL2) created an operational impasse for single-owner operations, blocking administrative staff management with HTTP `403 Forbidden` (`AAL2 required`) whenever the Owner operated from a standard password session.

Under migration `20260916233000`, the database and frontend architecture are re-frozen under a distinct two-tier governance model.

---

## 2. Two-Tier Workforce Security Contract

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: Routine Workforce Administration (AAL1 Allowed)                     │
│ Operations: Staff <-> Admin role toggles, status updates, archive/restore   │
│ RPCs: update_staff_status_v2, update_staff_role_v2, set_staff_archive_state │
│ Auth Level: AAL1 (standard authenticated session)                           │
│ DB Guards: can_manage_staff(), assert_privileged_account_quorum, audit log  │
│ UI Guard: Password re-confirmation on promotion (UX primary re-auth)        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: Owner-Sensitive & Core Security Boundaries                          │
│ Operations: Owner creation, demotion, suspension, deletion                  │
│ Architecture: Single-Owner invariant (admin@jezsy.com)                      │
│ Boundary: Tier 1 RPCs fail closed on role = 'owner'                         │
│ RPC: promote_workforce_to_owner (service-role only, revoked from client)    │
│ Edge Function: owner-lifecycle backend boundary                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tier 1 — Routine Workforce Administration
- **Scope**:
  - Role management between `staff` and `admin`.
  - Employment status transitions (`active`, `on_leave`, `resigned`, `terminated`).
  - Blocklist toggles (`is_blocked: true/false`).
  - Account archival and restoration (`deleted: true/false`).
- **Authentication Requirement**: `aal1` (standard email/password session). Third-party authenticator apps (TOTP) are **NOT required**.
- **Database Boundary & Invariants**:
  - `can_manage_staff()`: Caller must be an active, unblocked, undeleted `admin` or `owner`. (Admin callers additionally require an approved device; Owners bypass device approval).
  - `assert_privileged_account_quorum(target_user_id)`: Prevents demoting, blocking, or archiving the last active privileged account in the system (minimum threshold: $\ge 1$).
  - Self-Modification Guard: `target_user_id = auth.uid()` fails closed on role, status, and archive mutations.
  - Owner Immutability Guard: Target accounts with `role = 'owner'` cannot be altered by any Tier 1 RPC.
  - Audit Trail: Every change records actor ID, actor display name, target ID, previous state, new state, and note to `public.logs`.
  - Function Privileges: `SECURITY DEFINER`, pinned empty `search_path = ''`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`.

### Tier 2 — Owner-Sensitive Operations
- **Scope**: Creation or revocation of Store Owner authority.
- **Architecture**: Single-Owner model. The store operates with exactly one primary Owner (`admin@jezsy.com`).
- **Database Boundary & Invariants**:
  - `promote_workforce_to_owner` is strictly REVOKED from `PUBLIC`, `anon`, and `authenticated`.
  - Direct client invocation from the dashboard or PostgREST is blocked by PostgreSQL grant privileges.
  - Only backend service-role invocation via the `owner-lifecycle` Edge Function is permitted.
  - Requires active step-up validation within 5 minutes.
  - Routine workforce RPC `update_staff_role_v2` explicitly rejects `new_role = 'owner'` with SQLSTATE `42501`.

---

## 3. Classification of Dashboard Password Confirmation

The Admin Dashboard enforces a password confirmation dialog when the Owner promotes a staff member to Administrator.

> [!IMPORTANT]
> **Security Classification**: The dashboard password prompt is categorized strictly as:
> ```text
> Primary-Credential Re-Confirmation / In-Session Re-Authentication
> ```
> It is **NOT** a second factor, **NOT** multi-factor authentication (MFA), and does **NOT** issue or elevate the JWT claim to `aal2`. It serves as an intentional human UX confirmation barrier against accidental privilege elevation or unattended workstation abuse.

---

## 4. Formal Retirement of Prior Dual-Owner Runbook

The previous preflight requirement documented in `rbac-production-cutover-runbook.md`:
```text
usable_owner_count >= 2 with active verified TOTP MFA
```
is **OFFICIALLY RETIRED AND SUPERSEDED**.

The production environment operates under the verified **Single-Owner Model** (`admin@jezsy.com`), which fully satisfies the database quorum invariant:
```sql
v_active_count >= 1 (Organization retains at least one active, unblocked privileged account)
```

---

## 5. Live Production Verification Matrix

Executed on production database `wufcmtndotfvxvvxkamv` on 2026-09-16:

| Test ID | Scenario | Caller | Target | Expected Result | Live Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **V-01** | Staff calls `can_manage_staff()` | Staff (`cvwee23`) | N/A | Returns `false` | `false` | **PASSED** |
| **V-02** | Staff calls `update_staff_role_v2` | Staff (`cvwee23`) | Staff (`cvwee23`) | Rejects with `Unauthorized` | Exception caught | **PASSED** |
| **V-03** | Owner calls `can_manage_staff()` | Owner (`admin@jezsy.com`) | N/A | Returns `true` | `true` | **PASSED** |
| **V-04** | Owner attempts self-demotion | Owner (`admin@jezsy.com`) | Owner (`admin@jezsy.com`) | Rejects: `Cannot modify your own role` | Exception caught | **PASSED** |
| **V-05** | Owner promotes via Tier 1 RPC to `owner` | Owner (`admin@jezsy.com`) | Staff (`cvwee23`) | Rejects: `Owner role promotion is restricted` | Exception caught | **PASSED** |
| **V-06** | Owner mutates owner account | Owner (`admin@jezsy.com`) | Owner (`admin@jezsy.com`) | Rejects: `Cannot modify owner account status` | Exception caught | **PASSED** |
| **V-07** | Owner attempts self-block | Owner (`admin@jezsy.com`) | Owner (`admin@jezsy.com`) | Rejects: `Cannot modify your own status` | Exception caught | **PASSED** |
| **V-08** | Owner attempts self-archive | Owner (`admin@jezsy.com`) | Owner (`admin@jezsy.com`) | Rejects: `Cannot archive your own account` | Exception caught | **PASSED** |
| **V-09** | Quorum removal of sole owner | N/A | Owner (`admin@jezsy.com`) | Rejects: `Must retain at least one active account` | Exception caught | **PASSED** |

---

## 6. Sign-off Stamps

```text
WORKFORCE AAL1 POLICY AMENDMENT        — VERIFIED
IN-DASHBOARD STAFF MANAGEMENT          — VERIFIED
OWNER-SENSITIVE BOUNDARY               — VERIFIED / DOCUMENTED
OLD TWO-OWNER CUTOVER RUNBOOK          — SUPERSEDED
```
