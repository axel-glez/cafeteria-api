-- Se ejecuta dentro de una transacción y después de guardar el respaldo.
ALTER TABLE public.products ADD COLUMN category_id uuid;
UPDATE public.products p SET category_id=c.id FROM public.categories c WHERE c.name=p.category;
ALTER TABLE public.products ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY(category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;
DROP INDEX public.products_active_name_category;
ALTER TABLE public.products DROP COLUMN category, DROP COLUMN price;
CREATE INDEX products_category_id_idx ON public.products(category_id);
CREATE UNIQUE INDEX products_active_name_category ON public.products(lower(trim(name)),category_id) WHERE NOT archived;

CREATE TABLE public.presentations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE,
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 30),
 volume_ml integer CHECK(volume_ml BETWEEN 1 AND 10000)
);
INSERT INTO public.presentations(key,label,volume_ml)
 SELECT DISTINCT lower(trim(label))||':'||coalesce(volume_ml::text,''),trim(label),volume_ml FROM public.product_variants;
ALTER TABLE public.product_variants ADD COLUMN presentation_id uuid,
 ADD COLUMN available boolean NOT NULL DEFAULT true, ADD COLUMN archived boolean NOT NULL DEFAULT false;
UPDATE public.product_variants v SET presentation_id=p.id FROM public.presentations p
 WHERE p.key=lower(trim(v.label))||':'||coalesce(v.volume_ml::text,'');
ALTER TABLE public.product_variants ALTER COLUMN presentation_id SET NOT NULL;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_presentation_id_fkey FOREIGN KEY(presentation_id) REFERENCES public.presentations(id) ON DELETE RESTRICT;
ALTER TABLE public.product_variants DROP COLUMN label, DROP COLUMN volume_ml;
CREATE UNIQUE INDEX product_variants_active_presentation ON public.product_variants(product_id,presentation_id) WHERE NOT archived;

CREATE TABLE public.modifier_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 80),
 min_selections integer NOT NULL DEFAULT 0, max_selections integer NOT NULL DEFAULT 1,
 CHECK(min_selections>=0 AND max_selections>=min_selections AND max_selections BETWEEN 1 AND 12)
);
CREATE TABLE public.modifier_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80), price numeric(10,2) NOT NULL CHECK(price>=0),
 available boolean NOT NULL DEFAULT true, UNIQUE(group_id,name)
);
CREATE TABLE public.product_modifier_groups (
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE RESTRICT,
 PRIMARY KEY(product_id,group_id)
);
CREATE TABLE public.order_sessions (
 token_hash text PRIMARY KEY CHECK(length(token_hash)=64),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE public.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 session_hash text NOT NULL REFERENCES public.order_sessions(token_hash) ON DELETE RESTRICT,
 idempotency_key uuid NOT NULL, request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','preparing','ready','delivered','cancelled')),
 currency text NOT NULL DEFAULT 'MXN' CHECK(currency='MXN'), total numeric(12,2) NOT NULL CHECK(total>=0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_hash,idempotency_key)
);
CREATE INDEX orders_queue_idx ON public.orders(created_at DESC,id DESC);
CREATE INDEX orders_session_idx ON public.orders(session_hash,created_at DESC);
CREATE TABLE public.order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
 product_name text NOT NULL, presentation_label text NOT NULL, volume_ml integer,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 20),
 base_price numeric(10,2) NOT NULL CHECK(base_price>=0),
 unit_price numeric(10,2) NOT NULL CHECK(unit_price>=base_price),
 line_total numeric(12,2) NOT NULL CHECK(line_total=unit_price*quantity), position integer NOT NULL CHECK(position>=0)
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);
CREATE INDEX order_items_variant_idx ON public.order_items(variant_id);
CREATE TABLE public.order_item_options (
 item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
 option_id uuid NOT NULL REFERENCES public.modifier_options(id) ON DELETE RESTRICT,
 group_name text NOT NULL, option_name text NOT NULL, price numeric(10,2) NOT NULL CHECK(price>=0),
 PRIMARY KEY(item_id,option_id)
);
CREATE TABLE public.order_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 from_status text CHECK(from_status IN ('new','preparing','ready','delivered','cancelled')),
 to_status text NOT NULL CHECK(to_status IN ('new','preparing','ready','delivered','cancelled')),
 actor_account_id uuid REFERENCES cafe_access.accounts(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_history_order_idx ON public.order_status_history(order_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['presentations','modifier_groups','modifier_options','product_modifier_groups','order_sessions','orders','order_items','order_item_options','order_status_history'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon',t); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',t); END IF;
 END LOOP;
END $$;
