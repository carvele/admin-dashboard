# Implementation Brief — Inventory Variants, Admin Panel Layout, Activity Log

**Repo:** `admin-dashboard` (Jezsy Collection admin) · React + Vite + Supabase
**Audience:** development agent
**Status:** all three parts below describe work that does **not** yet exist in the codebase. Verify current state before assuming any of it is partially done.

---

## 0. Ground rules (read first)

1. **Verify before you claim.** After editing, re-read the file and confirm your change is on disk. `npm run build` passing proves the bundle compiled — it does **not** prove your edit exists. A prior session reported all of this work as complete when none of it had been written. End every part with a `grep` for a string you introduced.
2. **This repo has concurrent contributors.** PRs merge into `main` frequently from a parallel session. Before starting: `git fetch origin && git status`. Rebase or merge before opening a PR. Work on a feature branch, never commit directly to `main`.
3. **Do not lose stock counts.** Part 2 touches live inventory data. Any migration must be additive and reversible. Never `DROP` a column that holds quantities in the same change that adds a new one.
4. **Mobile app compatibility is mandatory.** A separate customer-facing mobile repo reads `products.color` (comma-joined string, split on `,`) and `products.pattern`. These fields must keep working exactly as they do today. New variant data is *additional*, not a replacement, until the mobile app is migrated separately.
5. **Migrations:** the mobile repo owns the migration directory; most existing migrations live only in the DB, not in this repo's `supabase/migrations/`. Write the SQL, but flag it for human review and coordinate before applying to production. Do not apply destructive SQL unattended.
6. **Design tokens only.** Colors come from CSS variables in `src/index.css` — `--cream #fdfbf7`, `--beige #f5eedc`, `--charcoal #1f1c18`, `--accent #d4af37` (gold), `--border-color #efe9db`, `--white`, `--text-secondary #544b45`, `--pink-accent #ec4899`. No new hex literals in components.
7. **Accessibility is a CI gate.** `npm run lint` runs `jsx-a11y` and **lint is a required CI check**. Every form control needs an associated label. Do not introduce new violations — CI will reject the PR.

---

## Part 1 — Inventory Administration Panel: fix the cramped layout

**File:** `src/components/inventory/AdminInventoryPanel.jsx`
**Styles:** `src/pages/catalog/Inventory.css`

### Current state (the actual problem)

The panel is laid out with utility classes plus **heavy inline styles**, and has no dedicated CSS classes at all — `Inventory.css` contains nothing for this panel. Root causes of the cramping:

- **Row 1** (~line 404) is `<div className="d-flex flex-wrap gap-6">` with three siblings competing for width: the Stock Baseline form (`minWidth: 250px`), `list('Colors', …)`, and `list('Patterns', …)` (each `minWidth: 250px`, defined by the `list()` helper at line 144). At common admin widths these three wrap awkwardly and each column is starved.
- **Row 2** (~line 450) is Categories + Sub-Categories, two columns at `minWidth: 220px`.
- `itemRowStyle` (line 290) uses `padding: '0.3rem 0.5rem'` with `marginBottom: '0.25rem'` — far too tight for rows containing a 24px thumbnail, an editable text input, and a Delete button.
- `scrollListStyle` (line 354) caps at `maxHeight: 220px` with `padding: 0.5rem`.
- Font sizes are pushed down inline to `0.7rem`–`0.875rem` in many places, compounding the density.

### What to do

**Move the panel's styling out of inline styles and into real CSS classes in `Inventory.css`,** namespaced `.aip-` (admin inventory panel). Keep behaviour identical — this is a presentation refactor plus a spacing pass.

Structure the panel as **three clearly separated card sections**, each with a header (icon + title + one-line subtitle) and generous internal padding:

1. **Stock Baseline Settings** — icon `Settings2`
2. **Master Attributes** — icon `Palette` — Colors and Patterns side by side
3. **Taxonomy** — icon `FolderTree` — Categories and Sub-Categories side by side

Section cards separated by a visible gap (not just a `border-top` hairline) — use `1.5rem`–`2rem` between sections and a subtle card surface (`var(--white)` on `var(--cream)` page background, `1px solid var(--border-color)`, `border-radius: 12px`).

**Spacing targets** (replace the cramped values):

| Element | Current | Target |
|---|---|---|
| Section card padding | n/a | `1.5rem` |
| List row padding | `0.3rem 0.5rem` | `0.6rem 0.75rem` |
| List row gap | `0.25rem` | `0.5rem` |
| Gap between form controls | `0.75rem` | `1rem` |
| Scroll list max-height | `220px` | `280px` |
| Min body font size | `0.7rem` | `0.8125rem` (13px) |

**Layout:** use CSS Grid, not flex-wrap, so columns are predictable:

- Master Attributes: `grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem`
- Taxonomy: same 2-column grid
- Stock Baseline: full-width card; put Product select / Baseline qty / Save button on **one row** at desktop (`grid-template-columns: 2fr 1fr auto`, `align-items: end` so the button baseline-aligns with the inputs)
- Collapse all grids to a single column below `900px`

**Also fix:** list rows currently put the name `<input>` at `width: '65%'` with a Delete button — use `flex: 1` with `min-width: 0` instead so long names truncate rather than overflow, and give the Delete button `white-space: nowrap`.

**Constraint:** do not change any handler, query, or state logic in this part. Markup and styles only. If you find a bug, note it — don't fix it here.

**Verify:** run the dev server, open Inventory → admin panel, screenshot at 1440px, 1024px, and 768px widths. Confirm no horizontal overflow and no overlapping controls at any of the three.

---

## Part 2 — Restock by Size **and** Colour **and** Pattern (product variants)

This is the substantial part. Plan it before writing code, and **propose the migration for review before applying anything**.

### Current data model

- **`products`** — `sizes` (array), `color` (comma-joined string of every available colour, e.g. `"Red, Ivory"`), `baseColor` (= `colors[0]`, used for admin filtering), `pattern` (single value, default `'Solid'`), `stock`, `status`.
- **`inventory`** — **one row per (product × size)**. Columns include `id`, `product_doc_id`, `sku`, `item`, `category`, `size`, `total`, `reserved`, `available`, `price`, `deleted`.
- `src/pages/catalog/ProductForm.jsx` (~line 470) creates one `inventory` row per size on product create, and soft-deletes rows for removed sizes on update.
- `src/services/productService.js` — `createInventoryItem`, `updateInventoryItem`, `syncProductStock`, and `recalculateAllInventoryStock` (~line 495) all key on size.

**The gap:** colour and pattern are *product-level display attributes*, not stock-tracked dimensions. The system cannot represent "4 × Red/Solid/M and 2 × Ivory/Floral/M" — it only knows "6 × M". Restock therefore cannot target a colourway.

### Target model — the industry-standard variant matrix

Every unique combination of options becomes its own stock-keeping row with its own SKU and independent quantities. This is how Shopify, Odoo, NetSuite matrix items, and every serious retail system model apparel: selling "Red / XL" must decrement only the Red-XL bin, never Blue-XL.

Track **three numbers per variant**: physical (`total`), `reserved`, and `available`. (Consider `inbound` for ordered-but-not-received later; out of scope now.)

**Schema — extend `inventory` rather than replacing it.** Add:

```
color        text        NOT NULL DEFAULT ''
pattern      text        NOT NULL DEFAULT ''
variant_sku  text                          -- e.g. GOWN01-RED-SOLID-M
```

Then replace the uniqueness constraint on `(product_doc_id, size)` with `(product_doc_id, size, color, pattern)`.

Rationale for extending over a new `product_variants` table: `inventory` already *is* the per-variant table, just with one dimension. Extending keeps every existing foreign key, RLS policy, and realtime subscription intact. A parallel table would require dual-writes and a long deprecation.

### Combinatorial explosion — handle this deliberately

5 sizes × 8 colours × 4 patterns = 160 rows. **Real boutiques do not stock every combination.** Do **not** auto-generate the full cross product.

Required UX: a **variant matrix builder** — show the grid of possible combinations with checkboxes, default to *unchecked*, and let the admin select only the combinations actually stocked. Show a live count ("12 of 160 combinations selected") before saving. Provide "select all in this colour" / "select all in this size" row-and-column helpers.

### Migration / backfill (highest risk — get this right)

For every existing `inventory` row, create the equivalent variant **without changing any quantity**:

```
UPDATE inventory
SET color   = COALESCE(NULLIF(p."baseColor", ''), ''),
    pattern = COALESCE(NULLIF(p.pattern, ''), 'Solid')
FROM products p
WHERE inventory.product_doc_id = p.id
  AND inventory.color = '';
```

Rules:
- Additive only. No column drops, no quantity recalculation in the migration.
- `total`/`reserved`/`available` carry over untouched.
- Write a verification query proving `SUM(total)` per product is identical before and after. Include it in the PR description with actual output.
- Provide a tested rollback.

### Reservation compatibility — the part most likely to break

`reservations` currently stores `product_id`, `product_name`, `size`, `quantity`. `recalculateAllInventoryStock()` matches reservations to inventory rows **on size alone** (`resSize === inv.size`). Once multiple variants share a size, that match becomes ambiguous and **will double-count or mis-assign reserved stock**.

Required:
- Add `variant_id` (FK → `inventory.id`) to `reservations`, plus `color`/`pattern` for display.
- Backfill existing reservations to the single matching variant per (product, size) — unambiguous today because only one exists.
- Rewrite the matcher to prefer `variant_id`, falling back to the legacy size match only for rows where `variant_id IS NULL`. Log a warning on fallback so stragglers are visible.
- Update `STOCK_HOLDING_STATUSES` handling to be variant-aware.

### Atomic writes — do not regress a fixed bug

A prior PR (`fix/atomic-stock-adjustment-race-condition`) closed a stock-adjustment race at **three call sites**. Restock and every new adjustment path must use the same atomic RPC pattern — **never** read-modify-write from the client. Find that RPC and reuse it; if it needs a variant-aware signature, extend it server-side. Re-introducing the race is a blocking failure.

### Restock UI

Add a restock flow that lets the admin:
- Pick a product, then see its stocked variants as a matrix (rows = size, columns = colour/pattern combo).
- Enter a **delta** ("+10"), not an absolute total — absolute overwrites are how concurrent edits lose data. Show resulting new total live.
- Bulk-restock several variants in one submit.
- See `total` / `reserved` / `available` per cell, with `available` visually dominant.
- Blocked cells (unstocked combinations) render as inert, not as zero-quantity inputs.

Every restock writes an activity log entry — see Part 3 for the required shape.

### Keep derived fields in sync

After any variant change, recompute and write back:
- `products.color` = comma-joined distinct colours across that product's non-deleted variants (mobile app depends on this exact format)
- `products.baseColor` = first colour
- `products.pattern` = the dominant/first pattern
- `products.stock` and `products.status` via existing `syncProductStock`

Breaking the mobile app's colour picker is a blocking failure.

### Suggested sequencing

Ship as **separate reviewable PRs**, not one mega-PR:
1. Schema migration + backfill + verification (no UI)
2. Service layer: variant-aware CRUD, atomic restock RPC, sync logic
3. Reservation variant linkage + matcher rewrite
4. Variant matrix builder in ProductForm
5. Restock UI
6. Activity log integration

Stop after each and report before continuing.

---

## Part 3 — Activity Log: readable, complete, clearly separated

**Files:** `src/pages/admin/ActivityLog.jsx`, `src/pages/admin/ActivityLog.css`

### Current state

A flat table — `When | Who | Action | Target` — with an expandable row that dumps `<pre>{JSON.stringify(log.details, null, 2)}</pre>` (line ~192). Target chips are colour-coded (`.al-target-product` etc. in the CSS) and pagination exists. There is **no** count badge, **no** Clear Filters control, **no** actor avatars, and details are raw JSON.

### Goal

The boutique owner — not an engineer — must understand every entry at a glance, while every detail stays available for forensics. Two requirements that must both hold: **easier to understand** *and* **all details retained**. Do not summarise data away; layer it.

### Required changes

**1. Human-readable sentence per entry.** The primary line must read as prose, not as a field dump:

> **Jhosu** restocked **Ivory Gown** · Red / Solid / M — **4 → 12** *(+8)*

not `Updated inventory` + a JSON blob. Build these from `action` + `targetType` + `details` with a formatter module (`src/utils/activityLogFormat.js`) mapping action types to sentence templates. **Always fall back to the raw action string** for unrecognised types — never render an empty or broken sentence.

**2. Before → After diffs, rendered as a table.** Where `details` contains changed fields, show `field · old → new` rows with the old value struck through / muted and the new value emphasised. Only render fields that actually changed.

**3. Keep the raw JSON.** Behind a collapsed "View raw data" toggle inside the drawer. This is the "include all the details" requirement — the formatter is a lens over the data, never a filter.

**4. Visual separation between entries** (explicitly requested):
- **Date group separators** — sticky headers: `Today`, `Yesterday`, `Monday, 17 August`. Group rows by calendar day.
- Each entry as a **distinct row with real breathing room** (`0.875rem` vertical padding minimum, `1px solid var(--border-color)` between).
- **Action-type icon + colour** on the left edge of every row: create (green, `Plus`), update (blue, `Pencil`), delete/archive (red, `Trash2`), stock movement (gold, `PackagePlus`), auth/device (purple, `Shield`). Derive the type from the action string; default to a neutral icon.
- **Actor avatar** — circular initial badge, colour derived deterministically from the user id (same user = same colour every time).
- **Timestamp** — relative ("2h ago") as primary, absolute on hover via `title`.

**5. Details in a right-side drawer, not an inline expanded row.** Opening details should not shift the table or lose scroll position. Keep the row highlighted while its drawer is open, and support `Esc` to close and arrow keys to move between entries with the drawer open.

**6. Filter toolbar improvements** — keep existing search / target-type / date-range controls, and add:
- A **"Clear filters"** button, visible only when at least one filter is active.
- A **total count badge** in the header (`1,284 recorded actions`).
- An **actor filter** (by user).
- Result count reflecting the active filter ("Showing 25 of 143 matching entries").

**7. Contextual linking.** Where `targetId` exists and the target is a product or reservation, link to that record. Conversely, entity detail pages should be able to deep-link into the log pre-filtered to that entity.

### Accessibility

- The drawer needs `role="dialog"`, `aria-modal`, focus trap, and focus restore to the triggering row on close.
- Rows opened by click must also be keyboard-operable (`Enter`/`Space`) — a clickable `<tr>` alone fails CI's `jsx-a11y` gate.
- Colour must never be the only signal — every colour-coded action type also carries an icon and text label.
- Every filter input needs an associated `<label>`, not just a `title` or `placeholder` (the current date inputs use `title` only — fix this).

### Performance

`PAGE_SIZE` is 25 with server-side pagination via `getPaginatedLogs`. Keep pagination server-side. Do all grouping and formatting on the current page only — never fetch the full log to group it client-side.

---

## Definition of done

- [ ] `npm run build` passes
- [ ] `npm run lint` passes with **no new** violations (lint is a required CI gate)
- [ ] `npm test` passes
- [ ] Screenshots at 1440 / 1024 / 768 px for Parts 1 and 3
- [ ] For Part 2: before/after `SUM(total)` verification output pasted in the PR description
- [ ] Each file you changed re-read and confirmed on disk — quote a `grep` hit for a string you introduced
- [ ] Anything you did **not** finish stated explicitly, not silently omitted

**If you cannot complete something, say so plainly. A partial change honestly reported is far more useful than a confident summary of work that was never written — that has already cost this project a full cycle.**

---

## References

- [Tracking inventory across size/colour SKUs](https://www.sumtracker.com/blog/how-to-track-variant-inventory-without-stock-errors)
- [SKU variations in ecommerce inventory management](https://www.shipbob.com/blog/sku-variations/)
- [Variant management in retail: sizes, colours, inventory](https://rackbeat.com/en/guide-to-variant-management-in-retail/)
- [Fashion size/colour variant matrix](https://www.braincuber.com/blog/fashion-managing-size-color-variants-matrix-without-headaches)
- [Audit logging for internal tools: change history patterns](https://appmaster.io/blog/audit-logging-internal-tools-activity-feed)
- [Audit logging best practices](https://dev.to/chipd/making-audit-logs-sexy-best-practices-for-audit-logging-with-examples-1pab)
