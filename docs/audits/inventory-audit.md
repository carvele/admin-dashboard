# Admin Inventory FULL AUDIT

## 0. Scope & Dependency Mapping
* **Audit Scope:** Inspected `src/pages/catalog/Inventory.jsx`, `src/components/inventory/AdminInventoryPanel.jsx`, and `src/pages/catalog/ProductForm.jsx`.
* **Dependency Scope:** Traced database calls through `src/services/productService.js`, `src/services/inventoryService.js`, `src/services/variantService.js`, and evaluated DB RPCs `adjust_inventory_on_hand`, `recalculate_inventory_stock`, and `record_boutique_sale`.
* **Evidence Limitations:** Did not exhaustively review mobile-side consumption of the `products.stock` field, but its architectural role is well-documented.
* **Tests Executed:** Ran local static analysis and dependency cross-referencing via grep.

## 📋 Audit Findings

### 🛑 [INV-001] Missing Stock Aggregation in Inventory RPCs
* **Claim:** The `adjust_inventory_on_hand` and `record_boutique_sale` RPCs mutate `inventory.available` and `inventory.total` directly but fail to update the parent product's aggregated `stock` and `status` fields.
* **Evidence:** In `docs/schema-history/admin-legacy-migrations/20260908140000_inventory_command_boundary.sql` and `20260910161500_pos_v1_add_record_boutique_sale_v2.sql`, the mutations end with an `UPDATE public.inventory` but never recalculate or update `public.products`.
* **Reproduction / Reasoning:** 
  1. Admin adjusts stock or records an in-store sale.
  2. The `inventory` row is correctly decremented.
  3. The `products.stock` (which drives the catalog view and mobile app availability) remains completely stale until someone manually clicks "Fix & Sync Stock".
* **Impact:** Customers using the mobile app may see a product as "In Boutique" when it is actually "Out of Stock", leading to failed walk-in visits or reservation race conditions.
* **Recommended Fix:** Extract the `totals` CTE from `recalculate_inventory_stock` into a shared trigger or append a targeted `UPDATE public.products p SET stock = (SELECT sum(available) FROM inventory WHERE product_doc_id = p.id) WHERE id = p_product_id` at the end of both RPCs.
* **Verification:** Perform a walk-in sale or manual restock in the dashboard, then check the `stock` column in the `products` table. It will remain unchanged.

### 🛑 [INV-002] Inventory Auto-Healer Skips Single-Color Products
* **Claim:** The `recalculateAllInventoryStock` function fails to auto-create missing size variants for products that only have a single color.
* **Evidence:** `src/services/productService.js:521` 
  ```javascript
  const colors = typeof p.color === 'string' ? p.color.split(',').map(c => c.trim()).filter(Boolean) : (Array.isArray(p.color) ? p.color : []);
  if (colors.length <= 1) continue;
  ```
* **Reproduction / Reasoning:** If an admin modifies sizes on a single-color product and a network error drops the inventory variant creation, clicking "Fix & Sync Stock" will silently skip the product due to the `colors.length <= 1` condition, leaving the missing variant permanently unhealable via the UI.
* **Impact:** Products with only one color cannot have missing variant rows restored automatically, blocking sales for those sizes.
* **Recommended Fix:** Change `if (colors.length <= 1) continue;` to `if (colors.length < 1) continue;`.
* **Verification:** Verified by inspecting the control flow in `productService.js`.

### ⏱️ [INV-003] O(N) In-Memory Filter Limits Variant Sync
* **Claim:** `ProductForm.jsx` fetches the entire active inventory database into memory to filter variants for a single product during save operations.
* **Evidence:** `src/pages/catalog/ProductForm.jsx`
  ```javascript
  const allInv = await getInventory();
  const productInv = allInv.filter(
    (inv) => (inv.productDocId || inv.product_doc_id) === id || ...
  );
  ```
* **Reproduction / Reasoning:** `getInventory()` delegates to `getCollection('inventory', true, 0)`. While `0` implies no limit, the Supabase API enforces a default 1,000-row maximum. Once the global inventory exceeds 1,000 active variants, `allInv` will silently truncate.
* **Impact:** `ProductForm` will fail to find existing variants for a product, assume they were deleted, and attempt to re-insert them, triggering fatal duplicate key constraint violations and permanently blocking product edits.
* **Recommended Fix:** Replace `await getInventory()` with `await getProductVariants(id)` (which is already imported and filters via `eq('product_doc_id', id)` on the server).
* **Verification:** Confirmed by reviewing Supabase API pagination defaults and `getCollection` wrapper implementation.

### ⚠️ [INV-004] Realtime Subscription Hard-Caps Dashboard View
* **Claim:** The main Admin Inventory view artificially truncates the inventory list, hiding rows from staff once the catalog grows.
* **Evidence:** `src/pages/catalog/Inventory.jsx`
  ```javascript
  const unsub = subscribeToInventory((data) => {
    // Realtime trimming contract: cap snapshot at 500
    setInventory(data.slice(0, 500));
    setLoading(false);
  });
  ```
* **Reproduction / Reasoning:** When the active inventory exceeds 500 rows, items 501+ will never render in the "Active" category tree view, nor will they be included in the "Active (Count)" header.
* **Impact:** Staff will be unable to see or manage stock for older or alphabetically-trailing variants unless they explicitly search for them.
* **Recommended Fix:** The client-side `.slice(0, 500)` cap should either be removed in favor of infinite scrolling/virtualization, or the default view should strictly rely on the paginated `searchInventoryPage` API instead of a flat realtime subscription.
* **Verification:** Confirmed by inspecting the React state setter in `Inventory.jsx`.

### 💡 [INV-005] Non-Atomic Product & Variant Creation
* **Claim:** `ProductForm.jsx` orchestrates multi-table mutations (product + variants) purely on the client side without a database transaction.
* **Evidence:** `src/pages/catalog/ProductForm.jsx` orchestrates `await createProduct(payload)` followed by a `try/catch` loop for `await createVariant()`. If it fails, it issues `await supabase.from('products').delete().eq('id', newDocId)`.
* **Reproduction / Reasoning:** If the admin loses connection, closes the tab, or the app crashes between product creation and the rollback delete, an orphaned product is left in the database without any inventory variants.
* **Impact:** Leaves the database in a partially committed, broken state.
* **Recommended Fix:** Migrate product and variant creation into a single Supabase RPC (e.g., `create_product_with_variants`) to guarantee ACID atomicity.
* **Verification:** Verified by inspecting the client-side `try/catch` rollback mechanism.
