-- Add updated_at column to categories and other tables that support updates
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
