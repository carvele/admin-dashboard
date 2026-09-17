# Inventory & Stock Lifecycle - Stage 2 Operating Contract

## 1. Domain Strengths to Preserve (IMMUTABLE)
The following architectural elements have been verified as robust and correct. Any remediation for other issues MUST NOT alter or destabilize these mechanisms:
* **Product Stock Aggregation:** `trg_sync_product_stock_from_inventory` and `sync_product_stock(uuid)` accurately update `products.stock` and `products.status`.
* **POS Concurrency:** The `record_boutique_sale` RPC correctly utilizes a `FOR UPDATE` lock on the specific variant inventory row.
* **POS Idempotency:** The `record_boutique_sale` RPC correctly performs dual-checks on the `idempotency_key` (before and after acquiring the row lock) to prevent double-charging network retries.
* **Category-Aware Sizing:** `ProductForm.jsx` owns category-aware derivation of canonical `sizes[]` and `colors[]`. The new RPC MUST consume these exact canonical strings without normalizing or reinterpreting them (e.g. "EU 38", "One Size", "US W 7.5").

---

## 2. Contract: [INV-005] Atomic Product & Variant Creation
**Objective:** Eliminate the client-side variant creation loop. Ensure that the creation of a Product, its Colorways, and its full matrix of Size/Color Inventory Variants happens within a single, atomic ACID database transaction.

### 2.1 Transaction & Security Boundary
* **Security:** The RPC must be `SECURITY DEFINER` and explicitly `SET search_path = ''` to prevent search path injection. All references must be schema-qualified. The RPC will enforce internal staff/admin/owner authorization (`can_operate_inventory()` or similar). Execute must be strictly revoked from `PUBLIC` and `anon`.
* **Atomicity & Exception Handling:** Product + colorways + inventory matrix = one transaction. If *any* failure occurs, the entire mutation rolls back. The transaction will allow PostgreSQL to raise errors directly rather than swallowing exceptions merely to return a JSON `{ success: false }` payload, guaranteeing strict rollback semantics.
* **RPC Versioning:** We will inspect the exact live signature of the current upsert RPC before replacing it. We will either atomically extend the canonical RPC or migrate callers to a single new one—leaving no competing write paths.

### 2.2 Variant Generation Rules
* **Matrix Generation:** The RPC dynamically cross-joins the product's `sizes` array with its active `colorways` (or `color` array).
* **Inventory Defaults:** `total`, `reserved`, and `available` will initialize to `0`. `deleted` initializes to `false`.
* **SKU / Style Code Behavior:** The product's base `style_code` (or `id`) is prepended. The variant SKU format will be `[STYLE_CODE]-[COLOR]-[SIZE]`. Colors will be stripped of whitespace and capitalized for the SKU string.

### 2.3 Idempotency Semantics
* **Adding Variants:** New variants in the matrix are inserted.
* **Existing Variants:** Existing variants with stock/history are NEVER silently replaced, reset, or deleted. Reserved variants remain protected by canonical reconciliation rules.
* **Removing Variants:** Variants missing from the submitted matrix that have NO stock history might be marked deleted/inactive, but any with active stock or reservations must be gracefully preserved. `ON CONFLICT (product_doc_id, size, color) DO NOTHING` prevents naive duplicate creation but must be paired with careful update semantics.
* **Identical Retry:** Submitting the exact same matrix against the same product idempotently returns the existing configuration without duplicate rows or errors.

---

## 3. Contract: [INV-004] Bounded Inventory Retrieval
**Objective:** Migrate from an unbounded realtime `select('*')` to a deterministically sorted, paginated fetch strategy in the Admin Dashboard.

### 3.1 Pagination & Deterministic Sorting Strategy
* **Canonical Strategy:** Server-side Offset/Limit Pagination using PostgREST's native `Range` headers.
* **Deterministic Ordering:** Every paginated query must use a stable server-side order before `.range()`: `filters -> order by chosen business column -> order by id as tie-breaker -> range(start, end)`. This prevents duplicate or missing rows across pages during concurrent edits.
* **Max-Row Safety:** Each request is intentionally bounded to `pageSize` (e.g. 50). Each page stays below the server row cap, ensuring users can navigate the complete dataset page by page without silent truncation.
* **Total Count:** Utilize `count=exact` header to retrieve the total active variants for table metadata.

### 3.2 Realtime Behavior
* **Safe Debounced Re-fetch:** When an `inventory` realtime mutation (INSERT / UPDATE / DELETE) is received, the client will debounce, then silently re-fetch the current page using the current filters and sort. 
* **Never Append:** The client will NEVER append unbounded realtime rows locally, as mutations can change page membership, total count, filter results, and sort position.

### 3.3 UI State Management
* **States:** The table must explicitly handle `loading`, `empty`, and `error` states gracefully.

---

## 4. Execution Scope (Files & Objects to Change)

### Database Layer (PostgreSQL)
* **CREATE MIGRATION:** A migration file with a timestamp strictly greater than `20260917211500_harden_rpc_search_path_and_settings_rls.sql`.
* **MODIFY/CREATE:** The canonical Product + Colorway + Variant atomic upsert RPC, strictly following the hardened security and transaction boundaries.

### Client Layer (Admin Dashboard)
* **MODIFY:** `src/pages/catalog/ProductForm.jsx` (Replace the non-atomic loop).
* **MODIFY:** `src/services/productService.js` (Point to the updated atomic RPC).
* **MODIFY:** `src/pages/catalog/Inventory.jsx` (Implement paginated fetch with debounced realtime reloading and deterministic sorting).
* **MODIFY:** `src/services/inventoryService.js` (Add `getPaginatedInventory` wrapper leveraging Supabase `.range(start, end)`).

---

## 5. Verification Matrix

| ID | Test Scenario | Expected Outcome |
|----|---------------|------------------|
| **V1** | Admin creates a new product with 3 sizes and 2 colors via `ProductForm`. | Exactly 1 product, 2 colorways, and 6 inventory variants are created atomically. |
| **V2** | Simulate an RPC error (e.g. invalid base SKU) during creation. | The transaction rolls back. 0 products, 0 colorways, 0 variants exist. |
| **V3** | Admin navigates pagination boundary checks. | Page 1 → Range 0-49, Page 2 → Range 50-99, Page 3 → Range 100-149. No duplicate IDs across adjacent stable pages. |
| **V4** | Total Inventory exceeds 1,500 variants with filters applied. | Filters applied server-side before pagination. Complete navigation available. Exact count correct. No silent truncation. |
| **V5** | Mutation occurs while viewing page. | Debounced current-page refetch occurs. No local duplicate rows. Total count refreshed when needed. |
