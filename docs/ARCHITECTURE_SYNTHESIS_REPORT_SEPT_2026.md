# Architecture Synthesis Ultra Report

**Date:** September 2026
**Scope:** Platform-Wide Synthesis of 35+ Audit Findings across Admin Dashboard, Mobile App, and Supabase Backend.

---

## 1. Executive Summary

The platform has successfully matured past its initial prototyping phase, but the recent 35+ audit findings across five major domains (Catalog, RBAC, Reservations, RTC, Analytics/Devices) reveal a system experiencing significant **growing pains at its architectural boundaries**.

While the individual bugs have been remediated, the historical ledger exposes a dangerous over-reliance on **client-side transaction orchestration** and **fragmented domain models**. The frontend was frequently tasked with enforcing business invariants (like stock deduction and audit logging) that belonged in the database. Moving forward, the platform is actively shifting toward a "thick database, thin client" architecture, relying heavily on `SECURITY DEFINER` RPCs to guarantee atomic state transitions.

---

## 2. Systemic Anti-Patterns

### Anti-Pattern A: Client-Side Transaction Orchestration
The most dangerous recurring theme was React components attempting to orchestrate multi-table mutations serially. This led to race conditions, partial failures, and security bypasses.
* **Evidence:**
  * `[ADMIN-INV-002]`: Walk-in sales read stale client-side inventory snapshots before deducting, leading to lost sales. (Remediated via `record_boutique_sale` RPC).
  * `[ADMIN-STAFF-007]`: Staff lifecycle management required multi-step client mutations. (Remediated via `update_staff_status` RPC).
  * `[ADMIN-LIFECYCLE-001/07/08/09]`: Reservation cancellations and stock invariant management were executed serially by the client. (Remediated via `admin_reservation_lifecycle_remediation`).
  * `[ADM-AUD-002]`: Audit logs were inserted manually by the client *after* an action, making them optional and forgeable. (Remediated via atomic RPCs).

### Anti-Pattern B: Fragmented Domain Vocabulary & Logic
Business logic was duplicated across multiple React components instead of being centralized, leading to rapid drift when requirements changed.
* **Evidence:**
  * `[ADM-ANA-001 - 005]`: The Analytics dashboard hand-rolled its own "Revenue" calculation, ignoring the shared definitions. (Remediated by centralizing `countsAsRevenue` into `analyticsMetrics.js`).
  * `[ADMIN-LIFECYCLE-006]`: The Messaging sidebar used stale vocabulary for reservation statuses and timezone formatting. (Remediated via `reservationStatus.js`).

### Anti-Pattern C: Fragmented Authorization Definitions
Security constraints drifted because "Who is an admin?" was defined differently across the Edge Functions, RPCs, and RLS policies.
* **Evidence:**
  * `[ADMIN-RBAC-003]`, `[ADMIN-RBAC-005]`: Edge Functions and RPCs rejected the 'owner' role because they only checked for 'admin'.
  * `[ADM-DEV-002]`: Device approval was verified by the React router but completely ignored by the Postgres RLS. (Remediated by injecting `is_device_approved()` into the core `is_staff_or_admin()` Postgres function).

---

## 3. Domain-Model Drift

There is a consistent friction point where the unstructured nature of Supabase JSONB payloads conflicts with the strict TypeScript interfaces expected by the frontend.
* **Evidence:**
  * **Mobile Inbox Type Regression**: During the RTC remediation (`[RTC-ADM-005]`), changing the shape of the `announcements` payload immediately broke the mobile build (`Property 'announcement_id' does not exist on type 'Json'`).
  * The frontend assumes a rigid shape for JSON columns, but the database does not enforce it.

---

## 4. Strategic Recommendations

To eliminate these classes of findings in the future, the following architectural shifts are recommended:

1. **Strict "RPC-First" Policy for Mutations:**
   Any user action that touches more than one table (e.g., updating a reservation + logging an audit + adjusting inventory) MUST be written as a `SECURITY DEFINER` Postgres RPC. The React frontend must never execute serial `supabase.from().update()` calls for business workflows.
2. **Centralized Edge-Function Cleanup:**
   The `[ADMIN-STAFF-008]` finding (orphaned Auth users) proved that Supabase Auth cannot be cleanly orchestrated from the client. All Auth-related lifecycle events should be exclusively managed by Edge Functions.
3. **Server-Side BI Pipeline (Deferred from `ADM-ARC-001`):**
   The platform currently relies on a "fetch everything and `useMemo` it" approach for Analytics. Before the database crosses 10,000 active reservations, we must implement a dedicated BI schema (or materialized views) and expose pre-aggregated metrics via RPCs to prevent client-side OOM errors.

---

## 5. Tooling Gaps & Verification Blockers

* **Lack of E2E Transaction Tests:** We currently rely on static compilation (`tsc`, `eslint`) to verify safety. Because our logic is moving heavily into Postgres RPCs, we lack an automated way to verify rollback/commit behavior without manually executing SQL in production.
* **Cross-Repo Dependency Hell:** A database migration in `admin-dashboard` can silently break `jezsy-mobile-app` (as seen in the Mobile Inbox regression). A unified Monorepo or a shared `@jezsy/database-types` NPM package is urgently needed to catch schema drifts at compile-time.
