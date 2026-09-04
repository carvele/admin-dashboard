---
name: architecture-synthesis-ultra
description: >-
  Consumes multiple completed feature audits, remediation reports, and verification ledgers from docs/audits/ to identify systemic architectural problems across the entire platform. Use when asked for '/architecture-synthesis ultra'.
---

# Architecture Synthesis Ultra: Platform-Wide Systemic Analysis

This skill elevates individual feature findings into system-level engineering intelligence. Its job is NOT to find new local bugs, but to analyze historical audit ledgers and identify dangerous patterns, duplicated logic, and architectural drift across the platform.

## 🚨 Core Synthesis Philosophy
- **Read-Only & Ledger-Driven:** Do not run a new codebase audit. Your input data is the collection of existing .md files in the docs/audits/ directory.
- **Pattern Recognition over Nitpicking:** Look for themes. If three different features deferred an issue due to "missing metadata," that is a systemic domain-model problem.
- **Cross-Platform Correlation:** Pay special attention to boundaries where Admin, Mobile, and Supabase intersect.

## 🔍 Synthesis Workflow

When triggered, execute the following steps:

### 1. Ingest the Ledgers
* Scan docs/audits/ (and any other specified audit directories).
* Read all Audit Reports, Remediation Reports, and Verification Ledgers.

### 2. Extract Systemic Patterns
Analyze the accumulated findings for the following patterns:
* **Duplicated Domain Logic:** Are different features solving the same problem independently?
* **Inconsistent Authorization Models:** Are RLS bypasses or permission checks drifting?
* **Database/Type Drift:** Are TypeScript interfaces repeatedly falling out of sync with Supabase schemas?
* **Shared State Inconsistencies:** Are global stores (Zustand, React Context) causing race conditions across features?
* **Architectural Boundaries Being Violated:** Is UI code repeatedly handling business logic?
* **Recurring Performance Problems:** Are we seeing the same GC pressure or render-loop bottlenecks everywhere?
* **Systemic Evidence Blockers:** What verification tools are we consistently missing (e.g., ADB profiling)?

### 3. Generate the Architecture Synthesis Report
Produce a structured markdown artifact summarizing your findings. Do not automatically modify repository architecture/code or create remediation tasks. Your output should purely be the synthesis report:

**1. Executive Summary:** (High-level assessment of the platform's architectural health)
**2. Systemic Anti-Patterns:** (Detailed breakdown of recurring issues, citing the specific `[FINDING-IDs]` that prove the pattern)
**3. Domain-Model Drift:** (Where the backend and frontend are fundamentally disagreeing)
**4. Strategic Recommendations:** (Major refactors or infrastructure changes required to eliminate entire classes of findings)
**5. Tooling Gaps:** (What evidence blockers are preventing thorough verification?)

## 📋 The Golden Rule
Do not invent systemic problems. **A systemic pattern requires corroboration across multiple independent findings unless a single finding demonstrates a platform-wide architectural violation by itself.** Every architectural claim MUST be backed by citing at least one (preferably multiple) `[IMMUTABLE_ID]` from the historical audit ledgers.
