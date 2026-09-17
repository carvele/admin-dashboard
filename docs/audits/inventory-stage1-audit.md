# Code Review Ultra: Inventory & Stock Lifecycle - Stage 1 Operational Audit

## 0. Scope & Dependency Mapping
* **Audit Scope:** Inspected `src/pages/catalog/ProductForm.jsx`, `src/pages/catalog/Inventory.jsx`, and live Supabase RPCs / triggers.
* **Dependency Scope:** Traced database calls through `src/services/productService.js`, `src/services/variantService.js`, `src/lib/supabaseService.js` and evaluated DB RPCs `adjust_inventory_on_hand`, `record_boutique_sale`, and triggers `trg_sync_product_stock_from_inventory`.
* **Evidence Limitations:** Read-only inspection focused on admin-side variant generation, realtime dashboard subscriptions, and live DB concurrency guarantees.
* **Tests Executed:** Static analysis of JavaScript code and live queries of Supabase RPCs and triggers.

---

## 📋 Audit Findings

### 🛑 Actual Defects

**[INV-004] Realtime Subscription Hard-Caps Dashboard View (Persisting)**
* **Claim:** The main Admin Inventory view still silently truncates the active inventory list, hiding rows from staff due to PostgREST `max_rows` limits and O(N) memory architectures.
* **Evidence:** `src/pages/catalog/Inventory.jsx` calls `subscribeToInventory`, which delegates to `src/lib/supabaseService.js` line 345: `supabase.from(table).select('*')` without pagination.
* **Reproduction / Reasoning:** Although the explicit `.slice(0, 500)` cap from the legacy audit was removed, the client still attempts to fetch the *entire* inventory table in one query. Supabase/PostgREST inherently limits `select('*')` queries to a configurable maximum (default 1,000). Once the active inventory exceeds this limit, the list is silently truncated on load, leaving trailing variants unmanageable via the "Active" view.
* **Impact:** Staff will be unable to see or manage stock for variants beyond the `max_rows` limit unless explicitly paginated via a search API.
* **Recommended Fix:** Replace `subscribeToInventory` with a paginated API (e.g., `searchInventoryPage`) as the primary data model, avoiding `select('*')` for unbounded tables.
* **Verification:** Confirmed by inspecting `subscribeToCollection` in `supabaseService.js`.

**[INV-005] Non-Atomic Product & Variant Creation (Worsened)**
* **Claim:** `ProductForm.jsx` orchestrates multi-table mutations (product + variants) partially on the client side without a database transaction, and the legacy rollback mechanism has been completely removed.
* **Evidence:** `src/pages/catalog/ProductForm.jsx` lines 680-760. It successfully wraps Product & Colorway creation in an atomic RPC (`upsertProductWithColorways`), but then iterates a non-atomic `for (const cell of toCreate) { await createVariant(...) }` client-side loop.
* **Reproduction / Reasoning:** If the admin loses connection, closes the tab, or the app crashes during the `createVariant` loop, the product is created but its inventory variants are partially missing. Because the previous `try/catch` rollback (`await supabase.from('products').delete()`) was removed, the product is permanently orphaned.
* **Impact:** Leaves the database in a partially committed, broken state, requiring manual DB intervention to repair orphaned products without sizes.
* **Recommended Fix:** Move the variant generation logic into the `upsertProductWithColorways` RPC to guarantee ACID atomicity across Product, Colorway, and Inventory tables.
* **Verification:** Verified by inspecting the client-side `try { for (...) { await createVariant() } } catch (e) { console.error(e) }` block in `ProductForm.jsx`.

---

### ✅ Remediated Historical Findings (No longer defects)

**[INV-001] Missing Stock Aggregation in Inventory RPCs**
* **Status: FIXED.** 
* **Evidence:** The live database schema now includes `trg_sync_product_stock_from_inventory` on the `inventory` table. Any `INSERT`, `UPDATE`, or `DELETE` on an inventory variant automatically fires `sync_product_stock(product_doc_id)`, successfully aggregating total available stock into the `products.stock` and `products.status` fields. Verified via live SQL definitions.

**[INV-002] Inventory Auto-Healer Skips Single-Color Products**
* **Status: FIXED.**
* **Evidence:** `src/services/productService.js` line 584 now correctly uses `if (colors.length < 1) continue;` rather than `<= 1`. Single-color products are now successfully processed by the variant auto-healer.

**[INV-003] O(N) In-Memory Filter Limits Variant Sync**
* **Status: FIXED.**
* **Evidence:** `ProductForm.jsx` was successfully migrated to `const productInv = await getProductVariants(targetDocId);` (e.g., line 218, 696) which correctly scopes the lookup to a specific product id rather than fetching the entire active inventory database into memory.

---

### 🛡️ Other Dimensions
* **Security & Data Integrity:** RLS policies and concurrency controls are robust. The `record_boutique_sale` RPC implements excellent `FOR UPDATE` locking and idempotency key checks (preventing double-charging on network retries) prior to stock mutation. 
* **Performance Risks:** Aside from the `subscribeToCollection` issue noted in `INV-004`, variant lookups in `ProductForm.jsx` are now O(1) wrt catalog size.
* **Architecture & Domain Contracts:** Inventory `sync_product_stock` correctly cascades status derivations (`In Boutique`, `Out of Stock`, `Reserved`).
