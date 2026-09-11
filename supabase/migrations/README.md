# Supabase Migrations — Deprecated Execution Surface

> **NOTICE: THIS DIRECTORY IS DEPRECATED AND DEACTIVATED AS A MIGRATION EXECUTION SURFACE.**

## Canonical Migration Lineage

Database schema migrations are governed under a single canonical repository:

- **Canonical Repository:** `carvele/jezsy-mobile-app`
- **Canonical Migrations Directory:** `jezsy-mobile-app/supabase/migrations/`

All future database migrations must be authored, reviewed, and applied through `jezsy-mobile-app` according to the B6 governance policies:
1. Canonical forward migrations follow the `<timestamp>_<name>.sql` format.
2. Every forward migration requires a companion `<timestamp>_<name>.sql.rollback` for disaster recovery.
3. Live migrations are applied strictly through authorized, audited procedures against the shared Supabase project (`wufcmtndotfvxvvxkamv`).
4. Type definitions (`src/types/database.types.ts`) are synchronized from the live schema into both `jezsy-mobile-app` and `admin-dashboard`.

## Historical Admin Migrations

Historical SQL migrations formerly stored in this directory have been relocated to:
`admin-dashboard/docs/schema-history/admin-legacy-migrations/`

Do **NOT** add `.sql` migration files to this directory. CI enforces this policy and will fail any build or check if `.sql` files are introduced here.
