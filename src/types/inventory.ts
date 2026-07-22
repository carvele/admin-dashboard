/**
 * Inventory Domain Types
 * Aligned with inventory-domain.instructions.md
 * Uses Supabase PostgreSQL schema (not Firestore)
 */

/**
 * Type of stock movement change
 */
export enum StockMovementType {
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  RESTOCK = 'restock',
  CORRECTION = 'correction',
}

/**
 * A single stock movement record (append-only audit entry)
 * DB table: stock_movements (immutable via CHECK constraint + trigger + RLS)
 * camelCase conversion handled by supabaseService.toCamel()
 */
export interface StockMovement {
  id: string; // UUID
  productId: string; // FK to products.id
  previousStock: number;
  newStock: number;
  delta: number; // newStock - previousStock
  changeType: StockMovementType | string; // 'manual_adjustment', 'restock', 'correction'
  note?: string;
  createdAt: string; // ISO 8601 timestamp, immutable
  updatedAt: string; // Always equals createdAt (CHECK constraint)
}

/**
 * Extended Product interface with inventory fields
 * DB table: products (extended with inventory columns)
 */
export interface Product {
  id: string;
  name: string;
  category?: string;
  subCategory?: string;
  price?: number;
  description?: string;
  material?: string;
  color?: string; // Existing field, now inventory-managed
  pattern?: string; // NEW: defaults to "Solid"
  stockBaseline?: number; // NEW: default 10, admin-editable
  dateAdded?: string; // NEW: ISO timestamp, set once at product creation
  stock?: number; // LEGACY: original stock field (still present)
  visibility?: string;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
}

/**
 * Product with computed inventory fields (used in dashboard)
 * currentStock and stockStatus are calculated, never stored
 */
export interface ProductInventoryView extends Product {
  currentStock: number; // Sum of all stock_movements[].delta
  stockStatus: string; // Label from utils/stockStatus.js's getStockHealth()
  stockPercentage: number; // (currentStock / stockBaseline) * 100
}

/**
 * Admin-managed color list entry
 * DB table: color_list (each row is one color)
 */
export interface ColorList {
  id: number;
  name: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * Admin-managed pattern list entry
 * DB table: pattern_list (each row is one pattern)
 */
export interface PatternList {
  id: number;
  name: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/**
 * Request shape for creating a stock movement
 * Used by inventory service functions
 */
export interface CreateStockMovementRequest {
  productId: string;
  newStock: number;
  changeType: StockMovementType | string;
  note?: string;
  // previousStock is computed in the service function
}

/**
 * Dashboard filter/sort options
 */
export interface InventoryFilter {
  status?: string | 'all';
  search?: string; // Product name search
  sortBy?: 'name' | 'status' | 'stock' | 'dateAdded';
  sortOrder?: 'asc' | 'desc';
}
