-- Migration: 20260908150000_inventory_grant_revocation.sql
-- Description: Phase B3 Migration B - Final Grant Revocation & Boundary Enforcement:
--              1. Revoke table-level UPDATE on public.inventory from authenticated, anon, PUBLIC.
--              2. Grant column-level UPDATE on public.inventory strictly to authenticated on approved
--                 metadata columns only (item, category, sku, variant_sku, demand_score, stock_tier,
--                 adjusted_score, demand_scored_at, updated_at). Excludes all stock, hold, lifecycle,
--                 and identity columns.
--              3. Revoke INSERT, UPDATE, DELETE on public.stock_movements from authenticated, anon, PUBLIC
--                 to seal the audit ledger so it is writable only by authoritative SECURITY DEFINER RPCs.
--              4. Drop legacy adjust_inventory_stock(uuid, integer, integer, integer) compatibility RPC.

-- ── 1. Inventory Table Privilege Revocation & Least-Privilege Column Grant ───

-- Revoke broad table-level UPDATE from non-superuser roles
REVOKE UPDATE ON public.inventory FROM authenticated, anon, PUBLIC;

-- Grant column-level UPDATE strictly to authenticated for benign metadata attributes
GRANT UPDATE (
  item,
  category,
  sku,
  variant_sku,
  demand_score,
  stock_tier,
  adjusted_score,
  demand_scored_at,
  updated_at
) ON public.inventory TO authenticated;

-- ── 2. Stock Ledger Immutability Boundary ─────────────────────────────────────

-- Seal stock_movements ledger against client-side direct writes
REVOKE INSERT, UPDATE, DELETE ON public.stock_movements FROM authenticated, anon, PUBLIC;

-- ── 3. Retire Legacy Clamping Function ────────────────────────────────────────

DROP FUNCTION IF EXISTS public.adjust_inventory_stock(uuid, integer, integer, integer);
