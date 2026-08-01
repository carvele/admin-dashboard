# Deployment Guide — Admin Dashboard

Target: **Cloudflare Pages** (free tier). Chosen because it's the only major free tier that is simultaneously OK for commercial/business use, has **no bandwidth cap** that could lock staff out mid-month, and supports SPA routing + build-time env vars for free.

> Rejected alternatives, for the record: **Vercel Hobby** — its ToS restricts the free tier to personal/non-commercial use, and an internal staff admin tool for a business is commercial (risk of being disabled without notice). **GitHub Pages** — its policy forbids commercial ventures *and* sites handling passwords, plus free accounts can only publish from public repos. **Netlify** — viable backup, but its 2025 credit-based free plan effectively caps at ~15 GB/month and simply stops serving when credits run out. **Render** — 5 GB/month is too tight. **Firebase Hosting** — would re-introduce the Firebase dependency this project just finished removing.

---

## Prerequisites (already done in the repo)

- `public/_redirects` contains `/*    /index.html   200` — required so React Router deep links (`/settings`, `/catalog/view/:id`) resolve instead of 404ing on refresh.
- `npm run build` runs `tsc && vite build` and outputs to `dist/`.
- No `service_role` key exists anywhere in client code (verified) — only the two Supabase edge functions use it, server-side via `Deno.env.get()`.

---

## Step 1 — Create the Cloudflare Pages project

1. Sign up / log in at <https://dash.cloudflare.com>.
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Authorize GitHub and select the `admin-dashboard` repository.
4. Configure the build:
   - **Production branch:** `main`
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Add **environment variables** (Settings → Environment variables → Production). These are build-time values:

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon (public) key |
   | `VITE_CLOUDINARY_CLOUD_NAME` | `dlrlgp4bq` |
   | `VITE_CLOUDINARY_UPLOAD_PRESET` | `ml_style_items` |
   | `VITE_SENTRY_DSN` | your Sentry DSN (optional) |

6. **Save and Deploy.** You'll get a URL like `https://admin-dashboard-xxx.pages.dev`.

> **On `VITE_*` variables:** Vite inlines every `VITE_`-prefixed variable into the client bundle as plain text — anyone can read them in devtools. This is expected and safe for the Supabase **anon** key, which is designed to be public and is protected by Row Level Security. **Never** put the `service_role` key in a `VITE_*` variable.

---

## Step 2 — Lock down edge-function CORS (do this right after Step 1)

The two Supabase edge functions (`create-staff-account`, `activate-staff-account`) already read an `ALLOWED_ORIGINS` allow-list, but currently default to `*` because there was no deployed origin yet.

Once you have the real URL from Step 1:

1. Supabase Dashboard → your project → **Edge Functions** → **Secrets**.
2. Add `ALLOWED_ORIGINS` = your deployed origin, e.g. `https://admin-dashboard-xxx.pages.dev`
   (comma-separated if you have more than one, e.g. staging + production).
3. Redeploy both functions so they pick up the secret:

```bash
supabase functions deploy create-staff-account --project-ref wufcmtndotfvxvvxkamv
supabase functions deploy activate-staff-account --project-ref wufcmtndotfvxvvxkamv
```

4. Verify — this should return your origin, not `*`:

```bash
curl -s -i -X OPTIONS "https://wufcmtndotfvxvvxkamv.supabase.co/functions/v1/create-staff-account" -H "Origin: https://admin-dashboard-xxx.pages.dev" | grep -i access-control-allow-origin
```

⚠️ Set this to the **exact** deployed origin. A wrong value blocks the real dashboard and breaks staff invites.

---

## Step 3 — Constrain the Cloudinary upload preset

The cloud name and unsigned preset ship in the public bundle, so anyone can read them and upload to your account. Cloudinary only receives **images** here (product images, category images, GCash QR) — 3D models and avatars go to Supabase Storage — so the preset can be locked to images safely.

In the **Cloudinary console** → **Settings** (gear) → **Upload** → **Upload presets** → edit `ml_style_items`:

- **Allowed formats:** `jpg, jpeg, png, webp` (images only)
- **Max file size:** e.g. 10 MB
- **Folder:** a fixed destination folder (e.g. `jezsy/`)
- Enable **moderation** / incoming transformation limits if available
- Keep the preset **Unsigned** (the app requires it), but constrained as above

A signed-upload flow (an edge function signs each request) is more correct but a bigger lift — do that only if these console constraints prove insufficient.

---

## Step 4 — Recommended: put an identity gate in front (optional but advised)

A `*.pages.dev` URL is public and crawlable. Supabase Auth + RLS is the real security boundary, but **Cloudflare Access** (Zero Trust free plan, up to 50 users) puts an identity check *in front of the app entirely* — a strong fit for an internal staff tool, at no cost.

Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → add a self-hosted app pointing at the Pages domain, with an email-based policy for your staff.

---

## Suggested rollout

1. Deploy to the free `*.pages.dev` URL first and treat it as **staging**.
2. Set `ALLOWED_ORIGINS` to that URL (Step 2).
3. Let staff smoke-test for a few days — especially: staff invite → set password → login, product create/edit, reservations, inventory adjustments.
4. Then promote to a custom domain if wanted (see below).

## About a custom domain

There is no genuinely free, permanent, professional custom domain in 2026. The old free TLDs (`.tk`, `.ml`, `.ga`, `.cf`, `.gq` via Freenom) are gone — Freenom shut down ~12.6 million domains after abuse litigation, and many networks/DNS filters block those TLDs outright, which would silently lock staff out.

Real options:
- **`*.pages.dev`** — free forever, HTTPS, trustworthy. Perfectly fine for an internal staff tool.
- **GitHub Student Developer Pack** — a `.edu.ph` address likely qualifies; includes a **free real domain for one year** (`.me` via Namecheap, or `.dev`/`.app` via Name.com). `.dev`/`.app` are HTTPS-only, a genuine plus for an admin panel.
- **Just buy one** — a `.com` is ~$10–15/year.

Attach any of these in Cloudflare Pages → **Custom domains** (free, SSL included).
