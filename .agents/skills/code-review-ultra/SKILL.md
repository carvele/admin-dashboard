---
name: code-review-ultra
description: >-
  Conducts an exhaustive, highly disciplined technical audit across architecture, contracts, performance, security, UX failure states, and observability. Use when the user requests a deep review, code audit, or asks for '/code-review ultra'.
---

# Code Review Ultra: Multi-Pass Deep Code Audit

This skill provides the standard operating procedure for performing an exhaustive, high-rigor code audit across Jezsy's React Native and Admin Dashboard repositories.

## 🚨 Core Audit Philosophy
- **Read-Only Mode:** DO NOT modify code while performing the audit. Separate diagnosis from remediation. Your output should only be the audit report.
- **Feature-by-Feature, but Dependency-Aware:** Do not just look at isolated UI files. Trace the complete dependency chain (e.g., UI → Hook → Service → Database → Response → Render).
- **Context over Dogma:** Do not treat engineering heuristics (e.g., "object spreading is bad") as absolute rules. Assess whether an implementation materially impacts frame-time, GC pressure, or scalability in its specific execution context.
- **Differentiate Findings:** Distinguish between actual defects, contract violations, risks, architecture concerns, and unverified hypotheses. Prevent AI severity inflation.

## 🔍 Audit Workflow (11 Dimensions)

When conducting a review, execute across all dimensions sequentially:

### 0. Scope & Dependency Mapping
Before Pass 1, explicitly establish and state:
* Feature entry points
* All directly imported modules
* Hooks/services/utilities used
* Database tables/functions involved
* External APIs/SDKs
* Shared components/constants
* Other features that consume or mutate the same data
* Relevant tests and architectural documents
* **Out-of-scope dependencies that could materially affect the result**

*Output this phase as:*
> **Audit Scope:** what was inspected
> **Dependency Scope:** what was traced
> **Evidence Limitations:** what could not be inspected
> **Tests Executed:** exact commands/results

### 1. Correctness & Logic
* Check for conditional hook calls, stale closures, missing dependencies, and state mutation.
* Inspect boundary/edge cases (NaN propagation, zero division, empty arrays, null/undefined).
* Ensure unmounted component updates are aborted (cancellation flags / AbortController) and promise rejections are caught.

### 2. Architecture & Domain Contracts
* Validate adherence to domain-specific documentation (e.g., `docs/ar-system-contract.md`).
* Ensure permissions, layout constants, and database layers adhere to a Single Source of Truth.

### 3. Cross-Feature Contract Audit
* Trace inputs/outputs across boundaries (Admin ↔ Supabase ↔ Mobile).
* Check that Database Schema ↔ TypeScript Types ↔ UI assumptions perfectly align.
* Ensure a change or assumption in one feature doesn't silently break another.

### 4. Database & Backend Integrity
* Audit RLS policies, foreign keys, constraints, and transaction atomicity.
* Identify race conditions around stock, reservations, and payments.
* Verify realtime subscriptions, server/client trust boundaries, edge functions, and mutation idempotency.

### 5. Performance Risks
* Do not call something a Performance Risk solely because it allocates, rerenders, performs an operation in a loop, or violates a preferred pattern.
* Establish materiality through profiling, complexity analysis, execution frequency, or strong architectural evidence (especially inside 60fps render loops or camera worklets).
* Ensure clean unsubscribes for AppState, NetInfo, and native listeners to prevent memory leaks.
* Verify queries use indexed keys, appropriate pagination, and avoid over-fetching.

### 6. Security & Data Integrity
* Verify credentials, auth tokens, and private user details are not logged or exposed.
* Ensure data updates cannot corrupt related fields or bypass security boundaries.

### 7. UX / Failure-State Audit (Behavioral)
* Audit behavior under adverse conditions: loading, empty, offline, timeout, permission denied, expired session.
* Check for partial data handling, duplicate submission prevention, back navigation safety.
* Handle interrupted payments, interrupted camera sessions, and app backgrounding/foregrounding smoothly.

### 8. Observability & Recovery
* Are important failures detectable and actionable, or are errors swallowed?
* Can production failures be diagnosed? Are logs leaking sensitive information?
* Can failed mutations safely be retried?

### 9. Type Safety & TypeScript Strictness
* Eliminate unsafe `any` casts where typed models exist.
* Check that union types and switch statements have complete cases or fallback guards.

### 10. Test & Regression Verification
* Run `npx tsc --noEmit` and the Jest test suite (if applicable).
* Verify critical paths have corresponding test coverage or explicit validation steps.

## 📋 11. Verification Discipline & Output Format
Every finding MUST follow this exact structure to prevent AI overconfidence. Present findings grouped by the Severity Categories below.

**[Severity] Finding Title**
* **Claim:** (What is the issue?)
* **Evidence:** (Reference the exact file path and line range whenever available. Quote only the minimum relevant code necessary.)
* **Reproduction / Reasoning:** (How does this fail or cause risk?)
* **Impact:** (What is the consequence?)
* **Recommended Fix:** (Code snippet or architectural change)
* **Verification:** (Explicitly state how to test it. If you cannot prove it from available code, explicitly state **"Unverified Hypothesis"**).

### 🛡️ No Finding Rule
**Auditors MUST NOT manufacture findings to satisfy the audit format.** If a dimension was investigated and no substantiated issue was found, explicitly report **"✅ No substantiated finding."** Distinguish this clearly from areas that could not be verified.

### Severity Categories
*A finding must not be classified as an Actual Defect, Security Risk, or Performance Risk unless the available evidence supports that classification. When evidence is insufficient, classify it as Unverified Hypothesis.*

* 🛑 **Actual Defect:** Demonstrably wrong behavior causing crashes or logic failures.
* ⚠️ **Contract Violation:** Code contradicts established Jezsy architecture/spec.
* 🔒 **Security/Data Integrity Risk:** Exploitable or corruption-prone behavior.
* ⏱️ **Performance Risk:** Measured or strongly evidenced bottlenecks.
* 💡 **Architecture Concern:** Things worth changing but not necessarily bugs.
* ❓ **Unverified Hypothesis:** Suspected issues lacking definitive proof in current context.
