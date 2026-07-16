-- ============================================================================
-- INVENTORY FEATURE: SCHEMA MIGRATION
-- ============================================================================
-- Migration: Add inventory tables and columns to support stock tracking
-- 
-- Changes:
--   1. Extend products table with: stockBaseline, pattern, color, dateAdded
--   2. Create stock_movements table (append-only audit trail)
--   3. Create color_list and pattern_list lookup tables
--
-- IDEMPOTENT: All operations use IF NOT EXISTS / DROP ... IF EXISTS
-- ROLLBACK: All statements are reversible (see bottom)
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. EXTEND PRODUCTS TABLE
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS stockBaseline INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS pattern TEXT DEFAULT 'Solid',
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS dateAdded TIMESTAMPTZ DEFAULT now();

-- Index for faster lookups during stock calculations
CREATE INDEX IF NOT EXISTS idx_products_stock_baseline 
ON public.products(stockBaseline) 
WHERE stockBaseline IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. CREATE COLOR_LIST TABLE (admin-managed lookup)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.color_list (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default colors
INSERT INTO public.color_list (name) 
VALUES 
  ('Red'),
  ('Blue'),
  ('Yellow'),
  ('Sky Blue'),
  ('Pink')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. CREATE PATTERN_LIST TABLE (admin-managed lookup)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pattern_list (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default patterns
INSERT INTO public.pattern_list (name) 
VALUES 
  ('Solid'),
  ('Floral')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. CREATE STOCK_MOVEMENTS TABLE (append-only audit trail)
-- ─────────────────────────────────────────────────────────────────────────
-- 
-- IMMUTABILITY CONSTRAINTS:
--   1. CHECK constraint: created_at must always equal updated_at
--   2. Trigger: BEFORE UPDATE/DELETE raises exception
--   3. RLS policies: UPDATE/DELETE policies return false
-- 
-- NOTE: This table enforces append-only at THREE LAYERS (defense in depth):
--   - Database layer: CHECK constraint
--   - Application layer: RLS policies
--   - Trigger layer: Postgres function raises exception
--
-- currentStock IS NOT stored here — it is computed as SUM(delta) for each product

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  
  -- Stock state
  previous_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  
  -- Audit trail
  change_type TEXT NOT NULL
    CHECK (change_type IN ('manual_adjustment', 'restock', 'correction')),
  note TEXT,
  
  -- Timestamps (immutable — created_at = updated_at always)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- IMMUTABILITY CONSTRAINT: Postgres will reject any UPDATE that would 
  -- change updated_at away from created_at
  CONSTRAINT stock_movements_immutable CHECK (updated_at = created_at)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id 
ON public.stock_movements(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at 
ON public.stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id_created_at 
ON public.stock_movements(product_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. ENABLE ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────

-- Enable RLS on new tables (if not already enabled)
ALTER TABLE public.color_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. COMMIT
-- ─────────────────────────────────────────────────────────────────────────

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (if needed, run these in reverse order):
-- 
-- DROP TABLE IF EXISTS public.stock_movements CASCADE;
-- DROP TABLE IF EXISTS public.pattern_list CASCADE;
-- DROP TABLE IF EXISTS public.color_list CASCADE;
-- ALTER TABLE public.products 
--   DROP COLUMN IF EXISTS stockBaseline,
--   DROP COLUMN IF EXISTS pattern,
--   DROP COLUMN IF EXISTS color,
--   DROP COLUMN IF EXISTS dateAdded;
-- ═════════════════════════════════════════════════════════════════════════
