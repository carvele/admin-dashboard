# Supabase

This repo shares one Supabase project (`wufcmtndotfvxvvxkamv`) with
[`jezsy-mobile-app`](https://github.com/carvele/jezsy-mobile-app), which is
the sole owner of `supabase/migrations/`. If you need a schema change,
add the migration there, not here — a copy here would fight the mobile
repo's history the next time either side runs `supabase db push`.

This repo keeps only its own edge functions in `functions/`.
