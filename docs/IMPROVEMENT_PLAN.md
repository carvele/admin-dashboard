# Admin Dashboard — Improvement Plan

Written 2026-07-24 from a full scan of `admin-dashboard` (22 pages, 11 components, 9 services, 66 source files; React 18 + Vite + Supabase). This is a prioritized backlog of real, code-grounded improvements — not generic advice. Each item says **what's wrong**, **why it matters**, and **how to fix**, with file references, so any one item can be pasted back to an agent as a self-contained task.

Priority key: **P0** = wrong/fake data users see now · **P1** = security/data-integrity · **P2** = robustness/quality · **P3** = UX/functionality gaps · **P4** = performance/cleanup.

---

## P0 — Users are seeing wrong or fake data

### 1. Customer engagement metrics are always zero/empty
**What:** `Customers.jsx` and `Dashboard.tsx` display `engagementScore`, `totalSpent`, `wardrobeItems`, `reservations` (count), `preferredSizes`, and `lastActive` per customer. A repo-wide search shows **none of these are ever computed** — nothing in `src/services/` sets them, and `profiles` has no such columns. So every customer shows `0` lifetime value, `0%` engagement, `0` reservations, "None yet" sizes, etc.
**Why:** The whole "Customer Health Score / Lifetime Value / Purchase Summary" section is decorative — it looks like analytics but reflects nothing. Same for the Dashboard "Active Customers"/engagement framing.
**How:** Add a `getCustomerStats(userId)` (or a batched version) in `customerService.js` that derives these from real tables — count + sum of `reservations` by `customer_id`, count of `wardrobe_items` by `user_id`, most-recent `last_online`/activity, and a defined formula for engagement. Enrich the customer list/detail with the results. Decide the engagement formula explicitly (e.g. weighted recency + reservation count + wardrobe activity) rather than leaving a fake number.

### 2. Dashboard "Operational Insight" weather is fully simulated
**What:** `Dashboard.tsx` (~line 193) computes weather from `new Date().getHours() % 4` and a hardcoded advice map — no weather API.
**Why:** It's presented to staff as an operational insight but is meaningless. Either make it real or stop implying it's data.
**How:** Wire a real weather API (store the key server-side / in an edge function, not the bundle), keyed to the boutique's city from Settings — **or** remove the widget. Don't ship simulated data styled as insight.

### 3. Audit reservation status-value consistency
**What:** `Analytics.jsx` filters reservations against a long literal list (`'Completed' || 'Confirmed' || 'Approved' || 'To Pickup' || 'Active' || 'To Pay'`). Other pages compare against `'Pending'`, `'Request Approval'`, etc. There is no single source of truth for the allowed status strings.
**Why:** If the mobile app or a DB default ever writes a status not in a given list, that reservation silently drops out of counts/revenue — hard-to-notice wrong totals.
**How:** Define the canonical status set once (a `reservationStatus.js` constants + helper, like the `stockStatus.js` consolidation already done), and have every page filter/label through it. Verify the actual distinct `status` values in the DB match.

---

## P1 — Security & data integrity

### 4. Dependency vulnerabilities (`npm audit`: 2 high, 3 moderate)
**What:** `xlsx` (SheetJS) — **high** (prototype pollution + ReDoS, no fixed version on npm); `lodash`/`lodash.debounce` path — **high** (prototype pollution); `dompurify` — moderate.
**Why:** `xlsx` parses/produces spreadsheets (exports); a crafted file or input can trigger the ReDoS/pollution. These are shipped in the app.
**How:** `dompurify` — `npm update dompurify` to the patched release. `xlsx` — the npm build is stale; install SheetJS from their official CDN tarball per their advisory, or replace with a maintained lib (e.g. `exceljs`) for the export paths. Replace `lodash.debounce` with a tiny local debounce or `use-debounce`. Re-run `npm audit` to confirm.

### 5. Finish the security hardening plan
See `docs/SECURITY_HARDENING_PLAN.md`. Done this session: gitignore (item 1), `.env.example` rewrite (item 2), env-driven edge-function CORS (item 5, deployed). **Remaining, needs you:** constrain the Cloudinary unsigned upload preset in the Cloudinary console (item 3); lock down or decommission the old `jeszybotiquear` Firebase project (item 4); set the `ALLOWED_ORIGINS` secret once the dashboard is deployed to a real origin (item 5 activation).

### 6. Reservation display IDs are generated on the client and collide
**What:** `Reservations.jsx` (~line 320) builds an ID as `RES-${reservations.length + 1}`. This is derived from the currently-loaded page length, so it repeats across sessions/paging, races between concurrent staff, and ignores the DB's `display_id` (which has a uniqueness migration).
**Why:** Two reservations can get the same human ID; the number resets as data is archived/filtered.
**How:** Generate `display_id` server-side — a Postgres sequence or a trigger on `reservations` — and have the client read it back, never invent it.

---

## P2 — Robustness & quality

### 7. Test coverage is ~nil
**What:** 3 test files for 66 source files, though Jest + Testing Library are fully set up.
**Why:** The schema-mismatch bugs fixed this session (measurements→profiles, categories `deleted`/`order`, customer `status`) are exactly what a few service-layer tests would have caught immediately.
**How:** Start with the data layer — tests for each `*Service.js` asserting the query shape and the row→camelCase mapping against a mocked Supabase client, plus the pure utils (`stockStatus.js`, `helpers.js`, validation). Add a smoke render test per page. Wire `npm test` into CI.

### 8. Error handling is inconsistent and swallows detail
**What:** ~27 catch blocks and ~69 `toast.error('literal')` calls; several `console.error('...', error)` log `[object Object]` (this is exactly what hid the "Failed to load settings" root cause for a while). Some catches swallow silently.
**Why:** Real errors are invisible or unactionable; debugging requires re-instrumentation every time.
**How:** Add a small `logError(context, err)` helper that logs `err?.message ?? err` plus the Supabase `code/details`, and route Sentry through it (Sentry is already installed). Standardize user-facing toasts to include `err.message` where safe. Lint for bare `catch {}`.

### 9. Remove debug/left-over code
**What:** 11 `console.log`/`console.debug` in shipped pages, 14 `TODO/FIXME/HACK`, `@ts-ignore` in 4 files (incl. the `useAuth() as { user: any }` casts I added — those point at a real gap: `AuthContext` is untyped).
**Why:** Console noise in production; `@ts-ignore` hides the untyped-context problem repo-wide.
**How:** Strip stray `console.*` (or gate behind the existing `Logger`). Type `AuthContext`/`useAuth` properly so the `@ts-ignore`/`as any` casts disappear. Triage the TODOs into this backlog or delete them.

### 10. Finish the taxonomy cutover (Phase 4b)
**What:** Products still carry redundant text columns (`products.category`, `products.sub_category`, `inventory.category`) alongside the real `category_id` FK; the admin write path (`ProductForm.jsx`) and `Analytics.jsx`/global search still read/write the text. (Tracked in the taxonomy-rebuild notes.)
**Why:** Two sources of truth for category drift out of sync (already caused a live storefront bug once). Can't drop the columns until the admin write path uses the FK.
**How:** Move `ProductForm.jsx`, `Analytics.jsx`, and `TopNav` search to read/write via `category_id`, then drop the redundant text columns in a mobile-repo migration.

---

## P3 — UX & functionality gaps

### 11. "New Reservation" quick action doesn't open a form
**What:** The Dashboard Quick Action navigates to `/reservations` (the list), not a create flow.
**Why:** It's labeled as an action but just changes pages; staff still have to find the add button.
**How:** Open the reservation-create modal directly — pass router state (e.g. `navigate('/reservations', { state: { openCreate: true } })`) and have `Reservations.jsx` open its create modal when that state is present.

### 12. The CSS is a hand-rolled utility system with recurring gaps
**What:** The app mimics Tailwind class names (`flex`, `grid-cols-2`, `animate-spin`, `badge`, …) with hand-written CSS. Missing definitions caused silent layout breakage repeatedly this session (stacked Quick Actions, static spinners, collapsed grids). ~60 used class tokens are still undefined (mostly one-off colors and real-Tailwind fragments in `MeasurementTable.jsx`).
**Why:** Every new page that uses an undefined class breaks silently; it's a standing source of "dead space / broken UI."
**How:** Either (a) adopt real Tailwind (biggest fix, removes the whole class of bugs — a deliberate migration), or (b) keep the hand-rolled layer but add a build/lint check that fails when a `className` token has no matching CSS rule. Pick one; the status quo keeps reintroducing the bug.

### 13. Accessibility pass
**What:** Mixed `aria`/alt coverage; many icon-only buttons; modals built as `div`s.
**Why:** Keyboard/screen-reader users and general robustness. `eslint-plugin-jsx-a11y` is installed but findings aren't enforced.
**How:** Turn on the a11y lint rules as errors, fix the batch (icon-button `aria-label`s, `alt` text, focus traps on modals, `Esc`-to-close), and keep them green.

---

## P4 — Performance & cleanup

### 14. Trim the heavy bundles
**What:** Pages are already `React.lazy`-code-split (good), but the Analytics chunk is ~735 KB (gzip ~239 KB) — it pulls in `xlsx` + `jspdf` + `recharts`. The 3D/AR stack (`three`, `@react-three/*`, `@mediapipe/*`) is also heavy.
**Why:** Slow first paint on the pages that need those libraries.
**How:** Dynamically `import()` `xlsx`/`jspdf` only inside the export handlers (not at module top), so they load on click, not on page open. Confirm the 3D/AR libs are only imported by the AR pages. Consider `manualChunks` to split vendor libs.

---

## How to use this doc
- Work top-down; P0 items change what users see and are the highest value.
- Each item is self-contained — paste one back to the agent as its own task ("do item 6 from IMPROVEMENT_PLAN.md").
- Items 1, 2, 3, 6, 11 are user-visible correctness/UX and make the best next session. Items 4, 5 are security. Items 7–10, 12–14 are foundational quality that prevent the next batch of bugs.
