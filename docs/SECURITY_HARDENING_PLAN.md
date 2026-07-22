# Security Hardening Plan — Admin Dashboard

Written 2026-07-23 following a structural security audit of this repo (paired with an equivalent audit of the `jezsy-mobile-app` repo, which shares the same Supabase project). This doc is the punch list for whoever — human or agent — picks up this repo next. Each item below is self-contained: what's wrong, why, and the exact fix. Nothing here has been applied yet.

Do these in order. Items 1-2 are quick and safe; do them before anything else, ideally before your next commit.

## 1. Gitignore the secrets sitting in the working tree (do this first)

**What's wrong:** `serviceAccountKey.json` (a Firebase Admin SDK service-account key — full admin access to the `jeszybotiquear` Firebase project) and `database_dump.json` (a full DB export containing customer data) are untracked files in this repo, and `.gitignore` does **not** cover them. Confirmed via `git check-ignore serviceAccountKey.json database_dump.json` → neither is ignored.

**Why it matters:** This repo is public on GitHub. A routine `git add -A` on unrelated work would publish a live admin credential and a customer-data dump irreversibly. `git log --all -- serviceAccountKey.json database_dump.json .env` confirms none of these have ever been committed — so this is prevention, not incident response, but it's the highest-impact fix available and it's one file edit.

**Fix:** add to `.gitignore`:
```
serviceAccountKey.json
database_dump.json
*.key.json
```
Also worth ignoring the other scratch files currently untracked in this tree so they can't get swept into a commit by accident: `Chapter 2.pdf`, `Chapter_2_extracted.txt`, `FINAL_REQUIREMENTS_CONTENT.md`, `FINAL REQUIREMENTS/`, `Hardware_Requirements_Revised.txt`, `Hardware_Requirements_Subsections_Revised.txt`, `Remaining_Sections_Revised.txt`, `read_docx.py`.

Verify after editing: `git check-ignore serviceAccountKey.json database_dump.json` should print both paths back.

## 2. Rewrite `.env.example` — it's stale and describes the wrong stack

**What's wrong:** `.env.example` currently documents only Firebase variables, populated with **real legacy values** (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID=jeszybotiquear`, sender ID, app ID). It documents **none** of the variables the app actually reads today: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`src/lib/supabaseClient.js`), `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` (`src/lib/storage.js`), `VITE_SENTRY_DSN` (`src/main.jsx`).

**Why it matters:** Anyone bootstrapping from this file gets a broken app (no Supabase config) and unused Firebase vars. Firebase web API keys are public-by-design (protected by Firebase Security Rules, not secrecy), so this isn't a leaked secret — but its presence, combined with `serviceAccountKey.json` sitting in the tree (item 1), means the old `jeszybotiquear` Firebase project's status should be checked: confirm it's either locked down (rules deny all) or fully decommissioned. An abandoned-but-live Firebase project is a data-exposure path independent of Supabase.

**Fix:** replace `.env.example` contents with the current stack, empty placeholders only:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
VITE_SENTRY_DSN=
```
Drop the Firebase section entirely. Separately (not a code change): verify the `jeszybotiquear` Firebase project's rules/status.

## 3. Constrain the Cloudinary unsigned upload preset

**What's wrong:** `src/lib/storage.js` (`uploadToCloudinary`) uploads directly to Cloudinary using `VITE_CLOUDINARY_CLOUD_NAME` + `VITE_CLOUDINARY_UPLOAD_PRESET`, and the preset must be **Unsigned** (per the function's own error message). Both values ship in the public JS bundle.

**Why it matters:** Anyone can read the cloud name and preset out of the built bundle and `POST` directly to `api.cloudinary.com/.../upload`, storing arbitrary images on the account — storage/bandwidth abuse, or hosting unwanted content under the brand's Cloudinary account.

**Fix (Cloudinary console, not code):** on the unsigned preset used here, set: allowed formats (images only), a max file size, a fixed destination folder, and enable moderation/incoming-transformation limits. This is the low-effort mitigation. A signed-upload flow (an edge function signs the request; the app never sees the preset) is more correct but a bigger lift — only do that if the console constraints aren't sufficient.

## 4. Remove legacy Firebase migration leftovers (once migration is confirmed done)

**What's wrong:** `functions/src/triggers/staffTriggers.ts` (firebase-admin Firestore triggers) and `scripts/export_db.cjs` (which reads `serviceAccountKey.json`) are Firebase→Supabase migration tooling, still in the tree after the app itself has fully moved to Supabase.

**Why it matters:** Every one of these files is either dead code or a reason `serviceAccountKey.json` needs to exist at all. Once you've confirmed nothing still depends on the Firebase side, deleting these retires the item-1 risk at its root instead of just gitignoring around it.

**Fix:** confirm the Firebase migration is fully complete (no remaining reads/writes against Firestore anywhere in `src/`), then delete `functions/src/triggers/staffTriggers.ts`, `scripts/export_db.cjs`, and `serviceAccountKey.json` itself. Do this after items 1-2 are in place, not before.

## 5. Narrow edge-function CORS

**What's wrong:** Both Supabase edge functions this repo calls — `create-staff-account` and `activate-staff-account` — set `Access-Control-Allow-Origin: *`.

**Why it matters:** Low severity — authorization in both functions rests on the caller's verified JWT and a server-side role check against `profiles`, not on request origin, so a forged origin gains nothing today. Narrowing CORS to this dashboard's actual deployed origin is still cheap defense-in-depth and cuts down on cross-origin noise.

**Fix:** in `supabase/functions/create-staff-account/index.ts` and `supabase/functions/activate-staff-account/index.ts`, change the `corsHeaders` constant's `Access-Control-Allow-Origin` from `*` to the dashboard's actual origin (or an env-driven allow-list if there's more than one deploy target, e.g. staging + prod).

## What's already good (don't touch)

Recorded so nobody "fixes" something that isn't broken: `create-staff-account` and `activate-staff-account` verify the caller's role server-side against their own `profiles` row before any privileged action, and the authoritative staff role is written to `app_metadata` (service-role-only) rather than the user-writable `user_metadata` — this correctly prevents self-promotion. The client (`src/lib/supabaseClient.js`) uses the anon key only; no service-role key exists anywhere under `src/`. `src/utils/permissions.js` is explicit that its matrix is UX only and RLS is the real enforcement boundary. No `dangerouslySetInnerHTML`/`innerHTML`/`eval` sinks were found in `src/`.

## Out of scope here

The corresponding DB-side hardening (RLS policy fixes, function `search_path`, storage bucket privacy, leaked-password protection) lives in `jezsy-mobile-app` and has already been applied directly to the shared Supabase project as of 2026-07-23 (migrations `20260722172736` through `20260722172949`) — nothing further is needed from this repo for those.
