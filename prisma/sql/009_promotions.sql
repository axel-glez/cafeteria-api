-- Aditiva y repetible: no modifica catálogo, pedidos ni anuncios existentes.
CREATE TABLE IF NOT EXISTS public.promotion_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 items jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 12),
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.promotion_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.promotion_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promotion_settings FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
  REVOKE ALL ON public.promotion_settings FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
  REVOKE ALL ON public.promotion_settings FROM authenticated;
 END IF;
END $$;
