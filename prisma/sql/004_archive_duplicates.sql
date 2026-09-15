ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS products_active_name_category ON public.products(lower(trim(name)),category) WHERE archived=false;
