# Admin Dashboard Strategic Architecture Baseline

**Phase B-0 Architecture & Guardrail Inventory**
This is a read-only baseline mapping the structural invariants, anti-patterns, and systemic risks across the Admin Dashboard repository before undertaking Phase B refactoring.

## STRAT-001: CI Integrity & Compiler Safeguards
- **ESLint Masking**: `eslint.config.js` completely disables critical type safety rules (`@typescript-eslint/no-explicit-any: 'off'`, `@typescript-eslint/ban-ts-comment: 'off'`, `@typescript-eslint/no-empty-object-type: 'off'`). This allows the compiler to silently tolerate cross-repo schema drift.
- **Typecheck Script**: `package.json` contains `"type-check": "tsc --noEmit"`. However, because `.tsx`/`.ts` files use `any` extensively (see STRAT-005), the typechecker provides a false sense of security.

## STRAT-002: Service & Telemetry Boundaries
- **Missing Telemetry**: Currently, components and legacy services interact with Supabase without wrapping operations in structured operational telemetry (e.g., `logger.info`, `logger.error` with `adminRole`, `entityType`, `metadata`). 
- **Silent Failures**: The absence of a telemetry boundary masks audit-log flows and hides failed data fetches.

## STRAT-003: UI/Component Direct Mutations
The mutation boundary is routinely violated. The following components execute inline database mutations (`.update()`, `.insert()`, `.delete()`, `.rpc()`) directly from the presentation layer:
- `StaffManagement.jsx` (e.g., `.update({ deleted: true })` on `profiles`)
- `Settings.jsx`
- `DeviceManagement.jsx`
- `ProductForm.jsx`
- `ARAssets.jsx`
- `AuthContext.jsx`

## STRAT-004: Admin Mutation Boundary Ledger
All mutations should be restricted to domain services, and authorization-sensitive ones should use Security Definer RPCs rather than direct DML.

### P0 Domains (Immediate Remediation Required)
1. **RBAC & Staff Lifecycle** (`StaffManagement.jsx`, `staffService.js`)
   - **Risk**: Staff profile updates and role changes (`update_staff_role`) are currently mixed with direct `.update()` calls. Client-facing mutations can bypass privilege boundaries.
2. **Inventory & Walk-in Sales** (`Inventory.jsx`, `inventoryService.js`)
   - **Risk**: Missing database-owned inventory invariants. Client-side stock math (`quantity = current - 1` then `UPDATE`) can lead to race conditions and lost deductions during concurrent admin operations.
3. **Messaging & Customer Support** (`Messages.jsx`, `communicationService.js`)
   - **Risk**: Needs integration with the hardened Realtime Command API developed in Mobile Phase A to prevent unauthorized message spoofing, editing, or deletion.
4. **Reservations** (`reservationService.js`)
   - **Risk**: P0 overlap with Inventory. Status mutations and stock reservations must be ACID compliant at the database level.

### P1-P3 Domains
- **P1**: Analytics & Audit Logging (Must guarantee non-repudiation; Admin components should not write audit logs as separate network operations).
- **P2**: Product Catalog & AR Assets (`ProductForm.jsx`, `ARAssets.jsx`).
- **P3**: Device Management, General Settings.

## STRAT-005: Type & JSON Contract Escapes
- **Extreme Contract Drift**: `src/types/index.ts` contains legacy **Firestore** definitions (`createdAt: string | Date | number | Record<string, number>`) rather than the generated Supabase `database.types.ts`.
- **Any Casts**: Heavy usage of `any` across TS files (`Sidebar.tsx`, `TopNav.tsx`, `Dashboard.tsx`, `garmentIngestor.ts`).
- **Manual Interfaces**: Admin maintains its own independent schema assumptions, diverging severely from Mobile Phase A and the actual Supabase schema.

## STRAT-006: Stale & Dead Features
- Legacy Firebase abstraction files still influence architectural decisions (e.g., legacy timestamps).
- Several services (`accountDeletionService.js`, `deviceService.js`) require audit to determine if they are active features or zombie scaffolding.

---
**Conclusion:** Admin cannot safely adopt Mobile's Phase A controls file-for-file. It requires an independent authorization matrix, removal of legacy Firebase typing, and strict enforcement of the service-layer mutation boundary before features can be safely touched.
