ALTER TABLE public.gyms
ADD COLUMN IF NOT EXISTS secondary_color text;

-- Keep existing rows visually consistent with a strong neutral accent.
UPDATE public.gyms
SET secondary_color = '#2C2C2C'
WHERE secondary_color IS NULL;
