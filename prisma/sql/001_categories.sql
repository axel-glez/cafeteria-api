-- Ejecutar una sola vez dentro de una transacción (scripts/migrate-categories.mjs).
-- Mantiene la API existente: products.category referencia categories.name.
LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

INSERT INTO public.categories (name)
SELECT DISTINCT category FROM public.products;

ALTER TABLE public.products
  ADD CONSTRAINT products_category_fkey
  FOREIGN KEY (category) REFERENCES public.categories(name)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX products_category_idx ON public.products(category);
