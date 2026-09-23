BEGIN;
CREATE TABLE IF NOT EXISTS public.media_files (
  id uuid PRIMARY KEY,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 4194304),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_files FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.media_files FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.media_files FROM authenticated; END IF;
END $$;
COMMIT;
