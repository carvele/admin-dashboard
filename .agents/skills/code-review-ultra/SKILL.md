---
name: code-review-ultra
description: >-
  Conducts an exhaustive, multi-pass deep code audit across correctness,
  architecture, performance, security, types, and regression risks. Use when the
  user requests a deep review, code audit, or asks for '/code-review ultra'.
---

# Code Review Ultra: Multi-Pass Deep Code Audit

This skill provides the standard operating procedure for performing an exhaustive, high-rigor code audit across Jezsy's React Native and Admin Dashboard repositories.

## Audit Workflow

When conducting a review, execute across all six dimensions sequentially:

### 1. Correctness & Logic
* **State & Hook Lifecycle:** Check for conditional hook calls, stale closures, missing dependencies in useCallback / useEffect / useMemo, and state mutation.
* **Boundary & Edge Cases:** Inspect [0, 1] bounding box mappings, division-by-zero, NaN propagation, empty arrays, and unexpected null / undefined values.
* **Async & Race Conditions:** Ensure unmounted component state updates are aborted (cancelled flags / AbortController) and promise rejections are caught.

### 2. Architecture & Domain Contracts
* **AR Pipeline & Math Contracts:** Validate adherence to docs/ar-system-contract.md (camera distance formulas, landmark unprojection, FOV compensation, yaw/roll conventions, anchor offsets).
* **Single Source of Truth:** Ensure permissions, geometry tokens (useGridCardWidth, GRID_GUTTER), and database access layers do not duplicate or diverge from canonical sources.

### 3. Performance & Resource Hygiene
* **Render Loop Efficiency:** Check for allocations, object spreading, or heavy matrix calculations inside 60fps render loops or camera frame processors.
* **Memory & Event Listeners:** Ensure AppState, NetInfo, and native camera subscriptions cleanly unsubscribe.
* **Data Fetching:** Verify queries use indexed keys, appropriate pagination (range()), and avoid over-fetching.

### 4. Security & Data Integrity
* **Row-Level Security (RLS):** Verify Supabase queries honor role permissions and don't bypass security boundaries.
* **Sensitive Data:** Verify credentials, auth tokens, and private user details are not logged to console or Sentry in production.
* **Data Mutations:** Ensure data updates cannot corrupt related fields (e.g. calibration metadata, inventory stock adjustments).

### 5. Type Safety & TypeScript Strictness
* **Type Coverage:** Eliminate unsafe any casts where typed models exist (Database['public']['Tables'], GarmentMetadata).
* **Exhaustive Handling:** Check that union types and switch statements have complete cases or fallback guards.

### 6. Test & Regression Verification
* Run npx tsc --noEmit and the Jest test suite (npm test).
* Verify that critical paths have corresponding unit tests (e.g. skeletalRetargeter.test.ts, permissions.test.js).

## Output Format
Present findings grouped by severity:
* 🚨 Critical / Blocker: Bugs causing crashes, data corruption, or security flaws.
* ⚠️ Warning / High Risk: Edge cases, performance leaks, or contract violations.
* 💡 Improvement / Refactoring: Type improvements, simplification, or code hygiene.
* ✅ Verification Passed: Explicitly state what was verified and tested cleanly.
