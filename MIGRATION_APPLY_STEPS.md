# Applying Inventory Migrations to Supabase

## Status: ✅ Files Created

The three migration files are now in `supabase/migrations/`:
- `20260712000000_add_inventory_schema.sql` — Schema tables and columns
- `20260712000001_add_rls_policies_and_triggers.sql` — RLS policies and immutability enforcement  
- `20260712000002_backfill_stock_movements.sql` — Backfill existing products with stock movements

**All files are idempotent and safe to re-run.**

---

## How to Apply Migrations

### Step 1: Authenticate with Supabase

Choose one method:

#### Method A: Login interactively
```bash
supabase login
# Opens browser to authenticate
# Your access token will be stored locally
```

#### Method B: Set access token in environment (for CI/CD or scripting)
```powershell
# Get token from: https://app.supabase.com/account/tokens
$env:SUPABASE_ACCESS_TOKEN = 'sbp_<your-token-here>'

# Verify it's set
echo $env:SUPABASE_ACCESS_TOKEN
```

### Step 2: Link Project

```bash
cd d:\AdminAR\admin-dashboard

supabase link --project-ref wufcmtndotfvxvvxkamv
# This creates .supabase/config.json (do NOT commit to Git)
```

### Step 3: Push Migrations

```bash
supabase db push
# Applies all migrations in supabase/migrations/ to your Supabase database
# Output will show:
#   ✓ 20260712000000_add_inventory_schema.sql
#   ✓ 20260712000001_add_rls_policies_and_triggers.sql
#   ✓ 20260712000002_backfill_stock_movements.sql
```

### Step 4: Verify

```bash
# Pull current schema back to local (confirms success)
supabase db pull

# Or check manually in Supabase Dashboard:
# https://app.supabase.com/project/wufcmtndotfvxvvxkamv/editor
```

---

## What Each Migration Does

### Migration 1: Schema
- Adds columns to `products`: `stockBaseline`, `pattern`, `color`, `dateAdded`
- Creates `stock_movements` table (append-only) with:
  - UUID primary key
  - Foreign key to products
  - `previous_stock`, `new_stock`, `delta` for audit trail
  - `change_type` (manual_adjustment, restock, correction)
  - CHECK constraint: `updated_at = created_at` (immutability)
- Creates `color_list` and `pattern_list` lookup tables
- Inserts default colors and patterns
- Creates indexes on `product_id`, `created_at`

### Migration 2: RLS Policies & Triggers
- Adds trigger `prevent_stock_movements_updates()` to reject UPDATE/DELETE
- Creates RLS policies for `stock_movements`:
  - SELECT: Public read access
  - INSERT: Admin-only (checks `profiles.role IN ('Admin', 'Owner')`)
  - UPDATE/DELETE: Explicitly denied
- Creates RLS policies for `products` (inventory columns admin-only)
- Creates RLS policies for `color_list` and `pattern_list` (admin-only writes)
- Uses `profiles` table to verify admin role (not `staff`)

### Migration 3: Backfill
- Creates initial `stock_movements` record for each existing product
- `changeType = 'correction'`, `previousStock = 0`, `newStock = products.stock`
- Idempotent: Only runs if product has NO existing movements
- Safe to re-run; won't create duplicates

---

## Verification Queries

After applying migrations, run these in Supabase SQL Editor to verify:

```sql
-- 1. Check schema changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('stockBaseline', 'pattern', 'color', 'dateAdded')
ORDER BY ordinal_position;

-- 2. Count new tables
SELECT COUNT(*) 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('stock_movements', 'color_list', 'pattern_list');

-- 3. Check backfill completed
SELECT COUNT(*) as backfilled_products
FROM stock_movements 
WHERE change_type = 'correction' 
AND note = 'Initial backfill from legacy stock field';

-- 4. Verify all products have movements
SELECT COUNT(*) as products_without_movements
FROM products p
LEFT JOIN stock_movements sm ON p.id = sm.product_id
WHERE p.deleted = false AND sm.id IS NULL;
-- Should return 0 if backfill was successful

-- 5. Sample stock movement record
SELECT id, product_id, previous_stock, new_stock, delta, change_type, note, created_at
FROM stock_movements 
LIMIT 1;

-- 6. Verify RLS policies exist
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'stock_movements' 
ORDER BY policyname;
```

---

## Troubleshooting

### Error: "Not authenticated"
→ Run `supabase login` or set `SUPABASE_ACCESS_TOKEN` environment variable

### Error: "Project not linked"
→ Run `supabase link --project-ref wufcmtndotfvxvvxkamv`

### Error: "Migration already applied"
→ This is expected if migrations were already pushed. Check `.supabase/migrations/` folder — your local state should match Supabase.

### Error: "CHECK constraint violation" during backfill
→ This means a `stock_movements` record already has `created_at ≠ updated_at`
→ Run backfill in test environment first to diagnose

### Error: "RLS policy admin check fails"
→ Verify `profiles` table exists with columns: `id` (UUID), `role` (text)
→ Check `profiles.role` contains values like 'Admin', 'Owner'

---

## Rollback (if needed)

Each migration includes a rollback section. Run the SQL in reverse order:

```sql
-- Rollback Migration 3 (backfill)
DELETE FROM public.stock_movements
WHERE change_type = 'correction'
AND note = 'Initial backfill from legacy stock field';

-- Rollback Migration 2 (RLS/triggers) — listed in migration file

-- Rollback Migration 1 (schema) — listed in migration file
```

Or use Supabase Dashboard to reset the database.

---

## Next Steps (After Migrations Applied)

1. ✅ **Phase 2: React Components**
   - Dashboard list view
   - Stock history modal
   - Admin controls for color/pattern lists
   - Status badge component

2. **Phase 3: Integration**
   - Wire up to supabaseService for CRUD operations
   - Add real-time listeners for color_list/pattern_list

3. **Phase 4: Testing & Accessibility**
   - E2E testing (append-only enforcement, RLS denial tests)
   - WCAG 2.2 AA compliance audit

---

## Files Involved

```
d:\AdminAR\admin-dashboard\
├── supabase/
│   ├── migrations/
│   │   ├── 20260712000000_add_inventory_schema.sql
│   │   ├── 20260712000001_add_rls_policies_and_triggers.sql
│   │   └── 20260712000002_backfill_stock_movements.sql
│   └── config.json (generated after `supabase link`)
├── src/
│   ├── lib/
│   │   ├── calculateStock.ts (pure functions)
│   │   └── calculateStock.test.ts (32 unit tests)
│   └── types/
│       └── inventory.ts (TypeScript types)
└── MIGRATION_APPLY_STEPS.md (this file)
```

---

**Ready to apply? Run: `supabase login` then `supabase db push`**
