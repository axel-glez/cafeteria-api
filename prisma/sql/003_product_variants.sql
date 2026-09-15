CREATE TABLE IF NOT EXISTS public.product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 30),
 volume_ml integer CHECK (volume_ml > 0 AND volume_ml <= 10000),
 price numeric(10,2) NOT NULL CHECK(price >= 0),
 position integer NOT NULL DEFAULT 0 CHECK(position >= 0),
 UNIQUE(product_id,label)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_label_normalized ON public.product_variants(product_id,lower(trim(label)));
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_variants FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.product_variants FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.product_variants FROM authenticated; END IF;
END $$;
INSERT INTO public.product_variants(product_id,label,price,position)
 SELECT id,'Único',price,0 FROM public.products p WHERE NOT EXISTS(SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id);
