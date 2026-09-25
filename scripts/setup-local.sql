\set ON_ERROR_STOP on

\if :{?db_name}
\else
  \echo 'Falta db_name. Ejecuta este archivo mediante el comando indicado en README.md.'
  \quit
\endif

SELECT format('CREATE DATABASE %I', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')
\gexec

\connect :db_name

SELECT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'cafe_access')
    AND c.relkind IN ('r', 'p')
) AS already_initialized
\gset

\if :already_initialized
  \echo 'La base ya contiene tablas. No se modifico. Consulta Solucion de problemas en README.md.'
  \quit
\endif

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image text NOT NULL DEFAULT '',
  category text NOT NULL,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

\ir ../prisma/sql/001_categories.sql
\ir ../prisma/sql/002_access.sql
\ir ../prisma/sql/003_product_variants.sql
\ir ../prisma/sql/004_archive_duplicates.sql
\ir ../prisma/sql/005_normalized_catalog_orders.sql
\ir ../prisma/sql/006_push_notifications.sql
\ir ../prisma/sql/007_cafe_status.sql
\ir ../prisma/sql/008_order_notes.sql
\ir ../prisma/sql/009_promotions.sql

COMMIT;

\ir ../prisma/sql/010_media_files.sql

\echo 'Base local preparada correctamente.'
