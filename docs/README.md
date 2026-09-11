# Documentation Taxonomy & Architecture Index

This index categorizes all engineering documentation across the \dmin-dashboard\ repository according to the lifecycle governance standards established in Phase B7.

---

## 1. Taxonomy Definitions

| Tier | Purpose | Edit Policy |
|---|---|---|
| **NORMATIVE** | Active operational guides, technical contracts, current architectural baselines, and deployment runbooks. | Living documentation maintained alongside code changes. |
| **HISTORICAL SNAPSHOT** | Point-in-time design explorations, handoff memos, phase roadmaps, and sprint research records. | Preserved as historical artifacts; not actively updated. |
| **AUDIT LEDGER** | Completed, immutable verification reports, closure ledgers, and formal gate records. | Strictly immutable. Never edit after phase closure. |
| **SUPERSEDED** | Legacy documentation formally replaced by newer normative standards. | Retained for audit trail; marked superseded in this index. |

---

## 2. Document Registry

### Normative Current-State Operations & Contracts
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Production deployment runbook for Cloudflare Pages (free tier), SPA routing configuration, and environment setup.
- [admin-ci-integrity-verification.md](./admin-ci-integrity-verification.md) — Administrative CI pipeline specification, test runners, and integrity check standards.

### Completed Immutable Audit Ledgers (\docs/audits/\)
- [audits/admin-strategic-remediation-baseline.md](./audits/admin-strategic-remediation-baseline.md) — Phase B2 administrative baseline remediation audit.
- [audits/architecture-remediation-program-phase-1.md](./audits/architecture-remediation-program-phase-1.md) — Cross-repo Phase B1-B3 Foundation Remediation Synthesis.
- [audits/architecture-synthesis-ultra-report.md](./audits/architecture-synthesis-ultra-report.md) — Cross-platform architecture synthesis report.
- [audits/customer-command-writer-inventory.md](./audits/customer-command-writer-inventory.md) — Customer mutation path and RPC boundary audit.
- [audits/inventory-writer-inventory.md](./audits/inventory-writer-inventory.md) — Inventory variant writer and stock movement audit.
- [audits/profile-writer-inventory.md](./audits/profile-writer-inventory.md) — Profile and staff RBAC mutation audit.

### Historical Snapshots & Research Records
- [ARCHITECTURE_SYNTHESIS_REPORT_SEPT_2026.md](./ARCHITECTURE_SYNTHESIS_REPORT_SEPT_2026.md) — September 2026 architecture synthesis memo.
- [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md) — Historical technical debt and improvement backlog.
- [INVENTORY_VARIANTS_AND_ACTIVITY_LOG_BRIEF.md](./INVENTORY_VARIANTS_AND_ACTIVITY_LOG_BRIEF.md) — Specification memo for inventory variants and audit logging.
- [PROPOSED_MIGRATION_inventory_variants.sql](./PROPOSED_MIGRATION_inventory_variants.sql) — Point-in-time migration draft for inventory variants.
- [SECURITY_HARDENING_PLAN.md](./SECURITY_HARDENING_PLAN.md) — Historical security hardening roadmap.
