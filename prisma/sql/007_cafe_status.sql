-- Aditiva y repetible: conserva el estado cuando se ejecuta de nuevo.
CREATE TABLE IF NOT EXISTS public.cafe_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 is_open boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.cafe_settings(id, is_open) VALUES (1, true)
 ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.cafe_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cafe_settings FROM PUBLIC;
-- Supabase expone estos roles; PostgreSQL local puede no tenerlos.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
  REVOKE ALL ON public.cafe_settings FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
  REVOKE ALL ON public.cafe_settings FROM authenticated;
 END IF;
END $$;
