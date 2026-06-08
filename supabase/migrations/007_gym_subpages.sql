-- 006 — Gym sub-page content columns

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS team_members JSONB,
  ADD COLUMN IF NOT EXISTS pricing_packages JSONB,
  ADD COLUMN IF NOT EXISTS map_embed_url TEXT,
  ADD COLUMN IF NOT EXISTS directions TEXT;

-- team_members shape (array of objects):
-- [{ name, role, bio, photo_url }]

-- pricing_packages shape (array of objects):
-- [{ name, price, duration, features, is_featured }]
-- price is stored as TEXT (e.g. "₱1,500/month") to allow flexible formatting

-- map_embed_url: Google Maps embed src URL
-- directions: free-text landmark/directions description
