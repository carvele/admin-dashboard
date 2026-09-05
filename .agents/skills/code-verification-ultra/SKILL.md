---
name: code-verification-ultra
description: >-
  Closes the loop on the Ultra engineering lifecycle. Answers 'Did we actually solve the problem?' by cross-referencing the original audit with the applied remediation. Use when asked for '/code-verification ultra'.
---

# Code Verification Ultra: Independent Quality Assurance

This skill provides the standard operating procedure for verifying remediations. Its job is neither auditing nor fixing, but rigorously checking if a fix succeeded without introducing regressions.

## 🚨 Core Verification Philosophy
- **Objective Proof:** Do not assume a fix works just because the code was changed. Demand static, runtime, or architectural proof.
- **Verification Must Reproduce the Original Failure Where Practical:** Do not merely verify that tests pass. Confirm that the original failure condition described in the audit can no longer occur.
- **Dependency Regression Check:** Verify that the fix did not silently break the broader system (e.g., an Admin fix breaking the Mobile app).

## 🔍 Verification Workflow

For every remediated finding, execute the following steps:

### 1. Trace the History
* Read the original finding (Claim + Evidence).
* Read the Applied Change from the Remediation Report.

### 2. Static & Regression Verification
* Run \
px tsc --noEmit\.
* Run test suites (\
pm test\) or other relevant static checks.

### 3. Dependency Regression Check
* Manually trace the altered code's dependents. Did the signature change? Did a Supabase RLS policy change lock out a mobile user?

### 4. Determine Final Status
Assign one of the following statuses based on hard evidence:
* ✅ **Resolved:** Fix works, verified statically/runtime, no regressions.
* 🟡 **Partially Resolved:** Improved, but edge cases remain or secondary systems still fail.
* ❌ **Not Resolved:** The applied change failed to fix the root cause.
* 🔴 **Regression Introduced:** The fix solved the issue but broke something else.
* ⚪ **Unable to Verify:** Lacking tooling (e.g., ADB profiling) to prove the fix worked.

## 📋 Verification Report & Audit Ledger
Output a markdown ledger summarizing the final state of the feature.

| Finding | Original Problem | Applied Fix | Verification Method | Final Status |
|---|---|---|---|---|
| ID-001 | Brief description | Brief description | Static / Runtime / Tests | ✅ / 🟡 / ❌ / 🔴 / ⚪ |

Provide a brief narrative for any finding that is not ✅ **Resolved**, explaining the missing evidence or new regression.
